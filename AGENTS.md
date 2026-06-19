# AGENTS.md — deploying this example

A canonical, copy-pasteable contract for an automated agent deploying
`thebes-example-chat` to a Thebes cluster. Human-readable detail is in
[README.md](README.md).

## Layout

```
thebes.toml                 deploy manifest (network + canisters)
motoko/main.mo              backend (Motoko); imports mo:thebes-lib/{Admin,MemphisAuth,Users,Pagination}
motoko/thebes-lib/          vendored backend library (local Mops dep — no external pin)
frontend/                   React + Vite app on @thebes/sdk
frontend/vendor/@thebes/sdk vendored SDK (local file: dep — no external pin)
```

## Toolchain (exact)

- Motoko compiler **1.4.1**, fetched by `mops install` to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Do **not** invoke a bare `moc` — a default `PATH` may resolve a different
  compiler version or Qt's Meta-Object Compiler.
- Node 18+, Mops, and the `thebes-deploy` CLI (Linux x86-64 prebuilt; build from
  the release source bundle on other platforms).
- `mops install` prints `core@2.5.0 requires moc >= 1.6.0` while 1.4.1 is pinned.
  This is expected — the cluster pins 1.4.1 and the build succeeds.

## Deploy

```sh
# 0. network: refresh the [networks.wan].validators in thebes.toml with the
#    endpoints printed by:
thebes-deploy init            # prints current WAN cluster validators

# 1. backend
thebes-deploy identity new me
thebes-deploy deploy chat     # → prints the backend cid (call it CHAT_CID)

# 2. frontend
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
cd frontend && npm install && npm run build && cd ..
sed -i 's#<head>#<head><script>window.CHAT_CID=CHAT_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web      # → prints https://memphis.mercaturaforum.com/_/raw/<cid>/index.html
```

Verify: `curl -s -o /dev/null -w '%{http_code}' <printed-url>` returns `200`.

## Calling the backend

```sh
thebes-deploy query chat userCount                      # queries need no identity
thebes-deploy query chat recent --arg '(20 : nat)'
thebes-deploy call  chat seedDemo                        # updates need a local identity
thebes-deploy call  chat register --arg '("Layla")'
thebes-deploy call  chat post --arg '("hello, room")'
```

Candid arguments are passed with the **`--arg` flag** in textual form
(e.g. `--arg '(20 : nat)'` or `--arg '("Layla")'`). **Positional argument forms
are rejected by the CLI** — always use `--arg`.

### Public methods

| Method | Kind | Args | Purpose |
| --- | --- | --- | --- |
| `register` | update | `(text)` | Create / update the caller's display name. |
| `setMyAvatar` / `setMyAvatarOrTrap` | update | `(text)` | Store the caller's media-contract avatar path. |
| `myProfile` / `myProfileView` | query | — | The caller's own profile (view form returns a 0-or-1 element vec). |
| `profileOf` | query | `(principal)` | Look up another member's profile. |
| `userCount` | query | — | Member count. |
| `roster` / `rosterView` | query | `(nat, nat)` | Paginated member roster (offset, limit). |
| `post` | update | `(text)` | Post a message as the transport sender. |
| `postAs` | update | `(blob, text)` | Post under a Memphis signed-in per-app principal. |
| `memphisSignOut` | update | `(blob)` | Forget a Memphis session token. |
| `recent` | query | `(nat)` | The last N messages. |
| `seedDemo` | update | — | Seed demo members + messages on an empty room. |
| `claimOwner` / `transferOwner` / `addAdmin` / `removeAdmin` / `setPaused` | update | varies | Ownership + admin surface (from `thebes-lib`'s `Admin`). |
| `getOwner` / `getAdmins` / `isPaused` | query | — | Admin-state reads. |

## Conventions that affect correctness

- **`window.CHAT_CID`** (and optional `window.MEDIA_CID`) are injected into the
  built page at deploy time; the frontend reads them at runtime. If you skip the
  injection step, the page falls back to compiled-in defaults and talks to the
  wrong backend.
- **Avatar images** live on a separate media contract addressed by
  `window.MEDIA_CID`; the chat backend stores only the returned path string, never
  image bytes. Without a media cid, members render without avatars.
- **`*OrTrap` methods** (e.g. `setMyAvatarOrTrap`) trap on a failed guard so the
  client sees a rejection instead of a silently-swallowed error. Frontends call the
  `OrTrap` form for any guarded write.
- **Boundary decoding** returns a `vec record` of scalar fields via the SDK's
  `decodeVecRecord`. A single record is a 0-or-1-element array; principal fields are
  56-character hex.
