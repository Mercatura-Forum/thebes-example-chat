# thebes-example-chat

An on-chain social room built on [Thebes Protocol](https://github.com/Mercatura-Forum/Thebes-Protocol-):
a Motoko backend that holds messages, member profiles, and the roster, and a React
frontend served as certified assets. It demonstrates the full shape of a Thebes
application — passkey sign-in, controller-gated admin, paginated reads, and
threshold-signed on-chain state — in one self-contained example.

## Architecture

```
frontend (React + Vite + Tailwind)   →   chat backend (Motoko)
   @thebes/sdk  ── boundary client       mo:thebes-lib ── Admin / MemphisAuth / Users / Pagination
   Memphis passkey gate                  messages · profiles · roster
```

- **frontend/** uses `@thebes/sdk` for the boundary client, typed query/update
  calls, React hooks, and the Memphis passkey gate. The SDK is **vendored** under
  `frontend/vendor/@thebes/sdk` and resolved as a local dependency
  (upstream source of truth: [`thebes-sdk`](https://github.com/Mercatura-Forum/thebes-sdk)).
- **motoko/** uses `thebes-lib` for `Admin` (controller-gated operations),
  `MemphisAuth` (passkey session verification), `Users` (profiles), and
  `Pagination`; the room logic lives in `main.mo`. The library is **vendored**
  under `motoko/thebes-lib` and resolved as a local Mops dependency.

Both halves are self-contained: the repository builds with no external Git or Mops
toolkit pins. The frontend asset-canister wasm is the one artifact fetched at
deploy time (see [Deploy](#deploy)).

## Backend interface (selected)

| Method | Kind | Purpose |
| --- | --- | --- |
| `register` | update | Create or update the caller's display name. |
| `setMyAvatar` / `setMyAvatarOrTrap` | update | Store the caller's media-contract avatar path; the `OrTrap` form traps on a failed guard so the client never silently ignores an error. |
| `myProfile` / `profileOf` / `userCount` | query | Read profiles and the member count. |
| `roster` / `rosterView` | query | Paginated member roster (offset, limit). |
| `post` | update | Post a message as the transport sender. |
| `postAs` | update | Post under a Memphis signed-in per-app principal. |
| `recent` | query | The last N messages. |
| `seedDemo` | update | Populate demo members + messages on an empty room. |
| `claimOwner` / `addAdmin` / `setPaused` | update | Ownership and admin surface (from `thebes-lib`'s `Admin`). |

Messages are an append-only, trimmed log; the roster is paginated via
`thebes-lib`'s `Pagination`. Avatar images live on a separate media contract — the
backend stores only the returned path string, never image bytes.

## Toolchain

- **Motoko compiler 1.4.1.** `mops install` fetches the pinned compiler to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Use that binary — the `moc` on a default `PATH` may be a different version, or
  Qt's unrelated Meta-Object Compiler.
- **Node 18+** and **[Mops](https://mops.one)** for the two builds.
- **[`thebes-deploy`](https://github.com/Mercatura-Forum/Thebes-Protocol-/releases)**
  to deploy. The prebuilt binary is Linux x86-64; on other platforms build it from
  the release source bundle (`cargo build --release -p thebes-deploy`).

## Run locally

```sh
# Frontend
cd frontend
npm install            # resolves the vendored @thebes/sdk
npm run dev            # sync-sdk copies the browser runtimes into public/, then Vite serves

# Backend (compile-check)
cd ../motoko
mops install           # resolves the vendored thebes-lib + the pinned compiler
"$(ls "$HOME/.cache/mops/moc/1.4.1/moc" "$HOME/Library/Caches/mops/moc/1.4.1/moc" 2>/dev/null | head -1)" --check $(mops sources) main.mo
```

## Deploy

`thebes.toml` describes the deploy. The `[networks.wan].validators` array ships
pre-filled with the current cluster endpoints — run `thebes-deploy init` to refresh
them.

### 1. Backend

```sh
thebes-deploy identity new me      # one-time local signing identity
thebes-deploy deploy chat          # build + install + verify → prints the backend cid
```

### 2. Frontend

The frontend installs an asset canister, then uploads your built bundle. Fetch the
asset-canister wasm once (it is referenced by `thebes.toml` as `asset_canister.wasm`):

```sh
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
```

Build the bundle and point it at your backend cid (the frontend reads
`window.CHAT_CID` at runtime), then deploy:

```sh
cd frontend && npm run build && cd ..
# inject the backend cid from step 1 into the built page:
sed -i 's#<head>#<head><script>window.CHAT_CID=YOUR_CHAT_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web           # install asset canister + upload bundle + verify
```

The deploy prints the live URL:
`https://memphis.mercaturaforum.com/_/raw/<web-cid>/index.html`.

> Member avatars are served by a separate media canister via `window.MEDIA_CID`.
> It is optional — without one, members render without avatar images.

For a machine-readable deploy contract, see [AGENTS.md](AGENTS.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
