import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Admin "mo:thebes-lib/Admin";
import MemphisAuth "mo:thebes-lib/MemphisAuth";
import Users "mo:thebes-lib/Users";
import Pagination "mo:thebes-lib/Pagination";

// Chat rooms with user profiles, on-chain avatars — and a breathing law.
//
// The property this example proves: an ACCOUNTABLE CONVERSATION. Every kept
// message is immutably attributed and strictly ordered; deletion leaves a
// tombstone (the record that something was said is never quietly erased);
// trimming is BOOKKEPT (kept + trimmed == everything ever sent); and the
// anti-spam cooldown is enforced on-chain, not in the client. The public
// oracle `invariantReportView` recomputes all four laws for every room —
// an empty report is the proof.
//
// Avatar IMAGES live in a separate media contract (the frontend uploads bytes
// there and gets back a path like "/avatar/{principal}") — this app stores
// only that path pointer, never image bytes (the storage law).
persistent actor ChatRoom {

  // Seconds a sender must wait between messages (the breathing law).
  let COOLDOWN_NS : Int = 3 * 1_000_000_000;
  // Kept messages per room; older ones are trimmed but stay on the books.
  let MAX_KEPT : Nat = 500;
  // A member is "here" if their presence beat within this window.
  let PRESENCE_NS : Int = 90 * 1_000_000_000;

  type Message = {
    id : Nat;
    roomId : Nat;
    text : Text; // "" when deleted (tombstone)
    sender : Principal;
    timestamp : Int;
    deleted : Bool;
    // emoji → who reacted (toggle per caller; small fixed emoji set)
    reactions : [(Text, [Principal])];
  };

  type Room = {
    id : Nat;
    name : Text;
    topic : Text;
    createdBy : Principal;
    createdAt : Int;
  };

  type RoomBooks = { totalSent : Nat; trimmed : Nat };

  var nextMessageId : Nat = 1;
  var nextRoomId : Nat = 1;

  let rooms = Map.empty<Nat, Room>();
  // Kept messages per room, oldest→newest (List = cheap append + O(1) size).
  let roomMessages = Map.empty<Nat, List.List<Message>>();
  let roomBooks = Map.empty<Nat, RoomBooks>();
  let lastPostAt = Map.empty<Principal, Int>();
  let banned = Map.empty<Principal, Bool>();
  let lastSeen = Map.empty<Principal, Int>();

  // Standard admin surface (lib/Admin): owner claim/transfer, admins tier,
  // emergency-stop pause. One stable var holds the whole admin state.
  var admin = Admin.init();

  // User profiles + role tiers (lib/Users) — a B-tree of principal → profile.
  let users = Users.init();

  public shared(msg) func claimOwner() : async Bool { Admin.claimOwner(admin, msg.caller) };
  public shared(msg) func transferOwner(n : Principal) : async Bool { Admin.transferOwner(admin, msg.caller, n) };
  public shared(msg) func addAdmin(w : Principal) : async Bool { Admin.addAdmin(admin, msg.caller, w) };
  public shared(msg) func removeAdmin(w : Principal) : async Bool { Admin.removeAdmin(admin, msg.caller, w) };
  public shared(msg) func setPaused(v : Bool) : async Bool { Admin.setPaused(admin, msg.caller, v) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };
  public query func getAdmins() : async [Principal] { Admin.getAdmins(admin) };
  public query func isPaused() : async Bool { Admin.isPaused(admin) };
  public shared query(msg) func amAdmin() : async Bool { Admin.isAdmin(admin, msg.caller) };

  // ── Profiles + avatars (lib/Users) ──────────────────────────────────────

  /// Create or update the caller's display name.
  public shared(msg) func register(displayName : Text) : async Users.Profile {
    Admin.requireNotPaused(admin);
    ignore beat(msg.caller);
    Users.register(users, msg.caller, displayName, Time.now());
  };

  /// Store the caller's media-contract avatar path (e.g. "/avatar/{principal}").
  public shared(msg) func setMyAvatar(path : Text) : async Bool {
    Admin.requireNotPaused(admin);
    Users.setAvatar(users, msg.caller, path);
  };
  public shared(msg) func setMyAvatarOrTrap(path : Text) : async () {
    Admin.requireNotPaused(admin);
    if (not Users.setAvatar(users, msg.caller, path)) { Runtime.trap("Register a display name first") };
  };

  public query(msg) func myProfile() : async ?Users.Profile { Users.get(users, msg.caller) };
  public query func profileOf(p : Principal) : async ?Users.Profile { Users.get(users, p) };
  public query func userCount() : async Nat { Users.count(users) };

  /// Paginated member roster in principal order.
  public query func roster(offset : Nat, limit : Nat) : async Pagination.Page<(Principal, Users.Profile)> {
    Pagination.page<(Principal, Users.Profile)>(Users.all(users), offset, limit);
  };

  // ── Presence ──────────────────────────────────────────────────────────────
  func beat(p : Principal) : Bool {
    Map.add(lastSeen, Principal.compare, p, Time.now());
    true;
  };
  /// The client pings this while the room is open; posting also counts.
  public shared(msg) func presenceBeat() : async () { ignore beat(msg.caller) };

  // ── Rooms ─────────────────────────────────────────────────────────────────

  func ensureRoom(id : Nat) : Room {
    switch (Map.get(rooms, Nat.compare, id)) {
      case (?r) r;
      case null { Runtime.trap("No such room.") };
    };
  };
  func booksOf(id : Nat) : RoomBooks {
    switch (Map.get(roomBooks, Nat.compare, id)) { case (?b) b; case null { { totalSent = 0; trimmed = 0 } } };
  };
  func msgsOf(id : Nat) : List.List<Message> {
    switch (Map.get(roomMessages, Nat.compare, id)) {
      case (?l) l;
      case null { let l = List.empty<Message>(); Map.add(roomMessages, Nat.compare, id, l); l };
    };
  };

  func createRoomRaw(name : Text, topic : Text, by : Principal) : Nat {
    let id = nextRoomId;
    nextRoomId += 1;
    Map.add(rooms, Nat.compare, id, { id; name; topic; createdBy = by; createdAt = Time.now() });
    id;
  };

  public shared(msg) func createRoom(name : Text, topic : Text) : async Nat {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in first.");
    if (Text.size(name) == 0 or Text.size(name) > 40) Runtime.trap("Room names are 1–40 characters.");
    if (Users.get(users, msg.caller) == null) Runtime.trap("Register a display name first.");
    ignore beat(msg.caller);
    createRoomRaw(name, topic, msg.caller);
  };

  // ── Posting: the breathing law + moderation, enforced on-chain ───────────

  func requireCanPost(sender : Principal) {
    if (Principal.isAnonymous(sender)) Runtime.trap("Sign in first.");
    switch (Map.get(banned, Principal.compare, sender)) {
      case (?true) { Runtime.trap("You are banned from this salon.") };
      case _ {};
    };
    if (Users.get(users, sender) == null) Runtime.trap("Register a display name first.");
    switch (Map.get(lastPostAt, Principal.compare, sender)) {
      case (?t) {
        if (Time.now() - t < COOLDOWN_NS) Runtime.trap("The room breathes — wait a moment between messages.");
      };
      case null {};
    };
  };

  func append(roomId : Nat, text : Text, sender : Principal) : Nat {
    ignore ensureRoom(roomId);
    let id = nextMessageId;
    nextMessageId += 1;
    let l = msgsOf(roomId);
    List.add(l, {
      id; roomId; text; sender; timestamp = Time.now();
      deleted = false; reactions = [];
    });
    let b = booksOf(roomId);
    var trimmed = b.trimmed;
    // Trim from the front, on the books.
    while (List.size(l) > MAX_KEPT) {
      // rebuild without the head (List has no removeFirst; do it once per overflow)
      let arr = List.toArray(l);
      List.clear(l);
      var i = 1;
      while (i < arr.size()) { List.add(l, arr[i]); i += 1 };
      trimmed += 1;
    };
    Map.add(roomBooks, Nat.compare, roomId, { totalSent = b.totalSent + 1; trimmed });
    Map.add(lastPostAt, Principal.compare, sender, Time.now());
    ignore beat(sender);
    id;
  };

  /// Post to a room. Rejected while banned, unregistered, or inside the cooldown.
  public shared(msg) func postTo(roomId : Nat, text : Text) : async Nat {
    Admin.requireNotPaused(admin);
    if (Text.size(text) == 0) Runtime.trap("Say something.");
    if (Text.size(text) > 2000) Runtime.trap("Messages are limited to 2000 characters.");
    requireCanPost(msg.caller);
    append(roomId, text, msg.caller);
  };

  /// Legacy single-room surface: posts to room 1.
  public shared(msg) func post(text : Text) : async () {
    Admin.requireNotPaused(admin);
    if (Text.size(text) == 0) return;
    requireCanPost(msg.caller);
    ignore append(1, text, msg.caller);
  };

  // Memphis session gate (lib/MemphisAuth): postAs lets a signed-in Memphis
  // user post under their stable per-app principal instead of the transport
  // sender. origin/version must match the client's derivation parameters.
  var gate = MemphisAuth.initFromCid(
    921,
    "https://memphis.mercaturaforum.com",
    1,
  );

  public shared(_msg) func postAs(token : Blob, text : Text) : async Result.Result<(), Text> {
    Admin.requireNotPaused(admin);
    if (Text.size(text) == 0) return #err("empty message");
    switch (await MemphisAuth.verify(gate, token)) {
      case (#err(#Expired)) { #err("Memphis session expired") };
      case (#err(#Memphis(_))) { #err("Memphis rejected the session token") };
      case (#ok(id)) {
        requireCanPost(id.principal);
        ignore append(1, text, id.principal);
        #ok(());
      };
    };
  };

  public shared(_msg) func memphisSignOut(token : Blob) : async () {
    MemphisAuth.forget(gate, token);
  };

  // ── Moderation ────────────────────────────────────────────────────────────

  /// Delete a message: its author may take it back; admins may moderate it.
  /// A TOMBSTONE remains — the conversation's shape is never quietly rewritten.
  public shared(msg) func deleteMessage(roomId : Nat, messageId : Nat) : async () {
    Admin.requireNotPaused(admin);
    let l = msgsOf(roomId);
    var found = false;
    List.mapInPlace<Message>(l, func(m) {
      if (m.id == messageId and not m.deleted) {
        if (not Principal.equal(m.sender, msg.caller) and not Admin.isAdmin(admin, msg.caller)) {
          Runtime.trap("Only the author or a moderator can remove a message.");
        };
        found := true;
        { m with text = ""; deleted = true; reactions = [] };
      } else { m };
    });
    if (not found) Runtime.trap("Message not found (it may have been trimmed).");
  };

  public shared(msg) func setBanned(who : Principal, value : Bool) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    Map.add(banned, Principal.compare, who, value);
  };
  public query func isBanned(p : Principal) : async Bool {
    switch (Map.get(banned, Principal.compare, p)) { case (?true) true; case _ false };
  };

  // ── Reactions (toggle per caller, small emoji set) ────────────────────────
  let EMOJI : [Text] = ["👍", "❤️", "😂", "🔥"];

  public shared(msg) func react(roomId : Nat, messageId : Nat, emoji : Text) : async () {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in first.");
    if (Array.find<Text>(EMOJI, func(e) { e == emoji }) == null) Runtime.trap("That emoji isn't in the set.");
    let l = msgsOf(roomId);
    var found = false;
    List.mapInPlace<Message>(l, func(m) {
      if (m.id == messageId and not m.deleted) {
        found := true;
        var hit = false;
        var next = Array.map<(Text, [Principal]), (Text, [Principal])>(m.reactions, func((e, who)) {
          if (e == emoji) {
            hit := true;
            let has = Array.find<Principal>(who, func(p) { Principal.equal(p, msg.caller) }) != null;
            let who2 = if (has) Array.filter<Principal>(who, func(p) { not Principal.equal(p, msg.caller) })
                       else Array.concat<Principal>(who, [msg.caller]);
            (e, who2);
          } else { (e, who) };
        });
        if (not hit) { next := Array.concat<(Text, [Principal])>(next, [(emoji, [msg.caller])]) };
        // drop empty reaction rows
        next := Array.filter<(Text, [Principal])>(next, func((_, who)) { who.size() > 0 });
        ignore beat(msg.caller);
        { m with reactions = next };
      } else { m };
    });
    if (not found) Runtime.trap("Message not found.");
  };

  /// Seed a small salon on a fresh deploy: a default room + demo voices.
  public shared(msg) func seedDemo() : async Bool {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) { Runtime.trap("Sign in to load demo data") };
    if (Map.size(rooms) > 0) { return false };
    let now = Time.now();
    let p1 = Principal.fromText("ffs4v-6g6ae");
    let p2 = Principal.fromText("wbwjw-qw6ai");
    let p3 = Principal.fromText("y5v2x-vg6am");
    ignore Users.register(users, p1, "Layla", now);
    ignore Users.register(users, p2, "Omar", now);
    ignore Users.register(users, p3, "Yusuf", now);
    let salon = createRoomRaw("the salon", "say hi — everything here lives on-chain", p1);
    let builders = createRoomRaw("builders", "what are you making on Thebes?", p2);
    ignore append(salon, "Welcome to the salon 👋", p1);
    ignore append(salon, "Every message here is on-chain — attributed, ordered, and on the books.", p2);
    ignore append(salon, "Pick a display name and say hi!", p3);
    ignore append(builders, "Shipping a storefront example today — the mug hero finally turns properly.", p2);
    true;
  };

  public query func recent(n : Nat) : async [Message] {
    let l = msgsOf(1);
    let arr = List.toArray(l);
    let len = arr.size();
    if (len == 0) return [];
    let start = if (n >= len) 0 else len - n;
    Array.tabulate<Message>(len - start, func(i) { arr[start + i] });
  };

  // ── The proof: four laws per room, recomputable by anyone ────────────────
  public query func invariantReportView() : async [{
    roomId : Nat; rule : Text; detail : Text;
  }] {
    let bad = List.empty<{ roomId : Nat; rule : Text; detail : Text }>();
    for ((rid, _) in Map.entries(rooms)) {
      let arr = List.toArray(msgsOf(rid));
      let b = booksOf(rid);
      // 1. accounting: kept + trimmed == everything ever sent
      if (arr.size() + b.trimmed != b.totalSent) {
        List.add(bad, { roomId = rid; rule = "books"; detail = Nat.toText(arr.size()) # " kept + " # Nat.toText(b.trimmed) # " trimmed != " # Nat.toText(b.totalSent) # " sent" });
      };
      var i = 1;
      while (i < arr.size()) {
        // 2. strict id ordering + 3. non-decreasing time
        if (arr[i].id <= arr[i - 1].id) {
          List.add(bad, { roomId = rid; rule = "id-order"; detail = "message #" # Nat.toText(arr[i].id) });
        };
        if (arr[i].timestamp < arr[i - 1].timestamp) {
          List.add(bad, { roomId = rid; rule = "time-order"; detail = "message #" # Nat.toText(arr[i].id) });
        };
        i += 1;
      };
      // 4. every kept sender is registered; 5. the breathing law held
      for (m in arr.values()) {
        if (Users.get(users, m.sender) == null) {
          List.add(bad, { roomId = rid; rule = "registered-senders"; detail = "message #" # Nat.toText(m.id) });
        };
      };
      i := 0;
      while (i < arr.size()) {
        var j = i + 1;
        while (j < arr.size()) {
          if (Principal.equal(arr[i].sender, arr[j].sender)) {
            if (arr[j].timestamp - arr[i].timestamp < COOLDOWN_NS and arr[j].timestamp > arr[i].timestamp) {
              List.add(bad, { roomId = rid; rule = "cooldown"; detail = "messages #" # Nat.toText(arr[i].id) # "/#" # Nat.toText(arr[j].id) });
            };
            j := arr.size(); // only the NEXT message from the same sender matters
          } else { j += 1 };
        };
        i += 1;
      };
    };
    List.toArray(bad);
  };

  /// One line for the footer: rooms, messages on the books, violations.
  public query func salonSealView() : async [{
    roomCount : Nat; keptMessages : Nat; totalEverSent : Nat; membersHere : Nat; violations : Nat; checkedAt : Int;
  }] {
    var kept = 0; var total = 0;
    for ((rid, _) in Map.entries(rooms)) {
      kept += List.size(msgsOf(rid));
      total += booksOf(rid).totalSent;
    };
    var here = 0;
    let now = Time.now();
    for ((_, t) in Map.entries(lastSeen)) { if (now - t < PRESENCE_NS) here += 1 };
    // violations: run the books check only (cheap seal; the full report is public)
    var v = 0;
    for ((rid, _) in Map.entries(rooms)) {
      let b = booksOf(rid);
      if (List.size(msgsOf(rid)) + b.trimmed != b.totalSent) v += 1;
    };
    [{ roomCount = Map.size(rooms); keptMessages = kept; totalEverSent = total; membersHere = here; violations = v; checkedAt = now }];
  };

  // ── Frontend view-models (flat records — easy to decode in the SPA) ──

  public query func roomsView() : async [{
    id : Nat; name : Text; topic : Text; keptMessages : Nat; totalEverSent : Nat; lastActivity : Int;
  }] {
    Array.map<(Nat, Room), { id : Nat; name : Text; topic : Text; keptMessages : Nat; totalEverSent : Nat; lastActivity : Int }>(
      Map.toArray(rooms),
      func((rid, r)) {
        let arr = List.toArray(msgsOf(rid));
        let last = if (arr.size() == 0) r.createdAt else arr[arr.size() - 1].timestamp;
        { id = r.id; name = r.name; topic = r.topic; keptMessages = arr.size(); totalEverSent = booksOf(rid).totalSent; lastActivity = last };
      },
    );
  };

  func reactionsSummary(m : Message, viewer : Principal) : (Text, Text) {
    var summary = "";
    var mine = "";
    for ((e, who) in m.reactions.values()) {
      if (summary != "") summary #= "|";
      summary #= e # ":" # Nat.toText(who.size());
      if (Array.find<Principal>(who, func(p) { Principal.equal(p, viewer) }) != null) {
        if (mine != "") mine #= "|";
        mine #= e;
      };
    };
    (summary, mine);
  };

  /// The room, joined server-side: name + avatar + reactions per message.
  public shared query(msg) func messagesView(roomId : Nat, n : Nat) : async [{
    id : Nat; sender : Principal; name : Text; avatarPath : Text;
    text : Text; timestamp : Int; deleted : Bool; mine : Bool;
    reactions : Text; myReactions : Text; nowNs : Int;
  }] {
    let arr = List.toArray(msgsOf(roomId));
    let len = arr.size();
    let start = if (n >= len) 0 else len - n;
    let now = Time.now();
    Array.tabulate<{ id : Nat; sender : Principal; name : Text; avatarPath : Text; text : Text; timestamp : Int; deleted : Bool; mine : Bool; reactions : Text; myReactions : Text; nowNs : Int }>(len - start, func(i) {
      let m = arr[start + i];
      let prof = Users.get(users, m.sender);
      let (summary, mine) = reactionsSummary(m, msg.caller);
      {
        id = m.id; sender = m.sender;
        name = (switch (prof) { case (?p) p.displayName; case null "ghost" });
        avatarPath = (switch (prof) { case (?p) (switch (p.avatarPath) { case (?a) a; case null "" }); case null "" });
        text = m.text; timestamp = m.timestamp; deleted = m.deleted;
        mine = Principal.equal(m.sender, msg.caller);
        reactions = summary; myReactions = mine; nowNs = now;
      };
    });
  };

  /// Members with presence, most recently seen first (paged).
  public query func rosterView(offset : Nat, limit : Nat) : async [{
    principal : Principal; displayName : Text; avatarPath : Text; createdAt : Int; here : Bool;
  }] {
    let now = Time.now();
    let page = Pagination.page<(Principal, Users.Profile)>(Users.all(users), offset, limit);
    Array.map<(Principal, Users.Profile), { principal : Principal; displayName : Text; avatarPath : Text; createdAt : Int; here : Bool }>(
      page.items,
      func((p, prof)) {
        let seen = switch (Map.get(lastSeen, Principal.compare, p)) { case (?t) now - t < PRESENCE_NS; case null false };
        { principal = p; displayName = prof.displayName; createdAt = prof.createdAt;
          avatarPath = (switch (prof.avatarPath) { case (?s) s; case null "" }); here = seen };
      },
    );
  };

  public query(msg) func myProfileView() : async [{ displayName : Text; avatarPath : Text; createdAt : Int }] {
    switch (Users.get(users, msg.caller)) {
      case (?prof) {
        [{ displayName = prof.displayName; createdAt = prof.createdAt;
           avatarPath = (switch (prof.avatarPath) { case (?s) s; case null "" }) }]
      };
      case null { [] };
    }
  };
}
