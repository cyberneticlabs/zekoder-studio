# Pre-flight detail

- Node: verified on 22/23; Node 24 works. Install with `npm install` at repo root (workspaces); `postinstall` runs scripts/postinstall-patches.mjs and `prepare` installs lefthook.
- Dev daemon: `npm run dev` (port 6768, checkout-local PASEO_HOME=.dev/paseo-home). `npm run cli -- daemon status` checks it.
- Production-style daemon on 6767 manages running agents: never restart without permission. Timeouts are not a reason to restart.
- No database, no migration tool, no external credentials required for typecheck/lint.
- Stale dist declarations are the common cause of spurious typecheck failures: run `npm run build:client` first.
- Dev setup details: docs/development.md.
