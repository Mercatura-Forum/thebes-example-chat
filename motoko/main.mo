import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Admin "mo:thebes-lib/Admin";
import MemphisAuth "mo:thebes-lib/MemphisAuth";
import Users "mo:thebes-lib/Users";
import Pagination "mo:thebes-lib/Pagination";

// Chat / social room with user profiles + on-chain avatars.
//
// Profiles + role tiers come from the reusable lib/Users module; avatar IMAGES
// live in a separate media contract (the frontend uploads bytes there and gets
// back a path like "/avatar/{principal}") — this app stores only that path
// pointer, never image bytes (the storage law). Messages are an append-only,
// trimmed log; the roster is paginated via lib/Pagination.
persistent actor ChatRoom {
  type Message = {
    text : Text;
    sender : Principal;
    timestamp : Int;
  };

  var messages : [Message] = [];
  let MAX_MESSAGES : Nat = 1000;

  // Standard admin surface (lib/Admin): owner claim/transfer, admins tier,
  // emergency-stop pause. One stable var holds the whole admin state.
  var admin = Admin.init();

  // User profiles + role tiers (lib/Users) — a B-tree of principal → profile.
  // `let` (not `var`): mo:core/Map is mutated in place and is stable under
  // `persistent actor`.
  let users = Users.init();

  public shared(msg) func claimOwner() : async Bool { Admin.claimOwner(admin, msg.caller) };
  public shared(msg) func transferOwner(n : Principal) : async Bool { Admin.transferOwner(admin, msg.caller, n) };
  public shared(msg) func addAdmin(w : Principal) : async Bool { Admin.addAdmin(admin, msg.caller, w) };
  public shared(msg) func removeAdmin(w : Principal) : async Bool { Admin.removeAdmin(admin, msg.caller, w) };
  public shared(msg) func setPaused(v : Bool) : async Bool { Admin.setPaused(admin, msg.caller, v) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };
  public query func getAdmins() : async [Principal] { Admin.getAdmins(admin) };
  public query func isPaused() : async Bool { Admin.isPaused(admin) };

  // ── Profiles + avatars (lib/Users) ──────────────────────────────────────
  // No cross-contract await here: the frontend uploads the avatar bytes to the
  // media contract directly, then calls setMyAvatar with the returned path.

  /// Create or update the caller's display name.
  public shared(msg) func register(displayName : Text) : async Users.Profile {
    Admin.requireNotPaused(admin);
    Users.register(users, msg.caller, displayName, Time.now());
  };

  /// Store the caller's media-contract avatar path (e.g. "/avatar/{principal}").
  /// Returns false if the caller has not registered yet.
  public shared(msg) func setMyAvatar(path : Text) : async Bool {
    Admin.requireNotPaused(admin);
    Users.setAvatar(users, msg.caller, path);
  };

  /// Trap-on-failure twin: traps "Register a display name first" when the caller
  /// has no profile yet, so a frontend gets a clear error rather than a bare false.
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

  // Memphis session gate (lib/MemphisAuth): postAs lets a signed-in Memphis
  // user post under their stable per-app principal instead of the transport
  // sender. origin/version must match the client's derivation parameters.
  var gate = MemphisAuth.initFromCid(
    921,                                  // the Memphis contract id
    "https://memphis.mercaturaforum.com", // app origin used at derivation
    1,                                    // pseudonym scheme version
  );

  func append(text : Text, sender : Principal) {
    let newMessage : Message = {
      text = text;
      sender = sender;
      timestamp = Time.now();
    };
    let oldLen = messages.size();
    let newLen = oldLen + 1;
    let resized = Array.tabulate<Message>(newLen, func(i) {
      if (i < oldLen) messages[i] else newMessage
    });
    messages := resized;
    if (newLen > MAX_MESSAGES) {
      messages := Array.tabulate<Message>(MAX_MESSAGES, func(i) { messages[i + newLen - MAX_MESSAGES] });
    };
  };

  public shared(msg) func post(text : Text) : async () {
    Admin.requireNotPaused(admin);
    if (text == "") return;
    append(text, msg.caller);
  };

  // Memphis-authenticated post: attributed to the user's stable per-app
  // principal, not the transport sender.
  public shared(_msg) func postAs(token : Blob, text : Text) : async Result.Result<(), Text> {
    Admin.requireNotPaused(admin);
    if (text == "") return #err("empty message");
    switch (await MemphisAuth.verify(gate, token)) {
      case (#err(#Expired)) { #err("Memphis session expired") };
      case (#err(#Memphis(_))) { #err("Memphis rejected the session token") };
      case (#ok(id)) { append(text, id.principal); #ok(()) };
    };
  };

  public shared(_msg) func memphisSignOut(token : Blob) : async () {
    MemphisAuth.forget(gate, token);
  };

  /// Seed a few demo members + messages on a fresh room so a just-deployed chat
  /// is alive. Global content: fires only when the room is empty. Demo members
  /// use fixed principals (no avatar bytes — those live on the media contract).
  public shared(msg) func seedDemo() : async Bool {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) { Runtime.trap("Sign in to load demo data") };
    if (messages.size() > 0) { return false };
    let now = Time.now();
    let p1 = Principal.fromText("ffs4v-6g6ae");
    let p2 = Principal.fromText("wbwjw-qw6ai");
    let p3 = Principal.fromText("y5v2x-vg6am");
    ignore Users.register(users, p1, "Layla", now);
    ignore Users.register(users, p2, "Omar", now);
    ignore Users.register(users, p3, "Yusuf", now);
    append("Welcome to the room 👋", p1);
    append("This whole chat lives on-chain — messages, profiles, the roster.", p2);
    append("Pick a display name and say hi!", p3);
    true;
  };

  public query func recent(n : Nat) : async [Message] {
    let len = messages.size();
    if (len == 0) return [];
    let start = if (n >= len) 0 else len - n;
    Array.tabulate<Message>(len - start, func(i) { messages[start + i] })
  };

  // ── Frontend view-models (flat records — easy to decode in the SPA) ──
  // `recent` already returns flat Messages (text/sender/timestamp). These flatten
  // the roster (tuple + opt avatar) and the caller's own profile (opt record):
  // avatarPath opt → "" when absent; myProfileView returns a 0-or-1 element vec
  // so the SPA's flat-record decoder handles "not registered" as an empty list.

  public query func rosterView(offset : Nat, limit : Nat) : async [{ principal : Principal; displayName : Text; avatarPath : Text; createdAt : Int }] {
    let page = Pagination.page<(Principal, Users.Profile)>(Users.all(users), offset, limit);
    Array.map<(Principal, Users.Profile), { principal : Principal; displayName : Text; avatarPath : Text; createdAt : Int }>(
      page.items,
      func((p, prof)) {
        { principal = p; displayName = prof.displayName; createdAt = prof.createdAt;
          avatarPath = (switch (prof.avatarPath) { case (?s) s; case null "" }) }
      },
    )
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
