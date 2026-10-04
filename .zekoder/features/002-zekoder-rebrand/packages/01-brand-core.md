# Package 01 — brand-core

- **Branch:** `002-zekoder-rebrand-01-brand-core`
- **Depends on:** none (runs in parallel with 02)
- **Owns contract:** `brand-module` (see `contracts.md`)

## Worktree setup

```bash
git worktree add ../worktrees/002-zekoder-rebrand-01-brand-core -b 002-zekoder-rebrand-01-brand-core main
cd ../worktrees/002-zekoder-rebrand-01-brand-core && npm install && npm run build:client
```

## Context

- No central branding exists today. `@getpaseo/protocol` is consumed by server, CLI, app and (via server)
  desktop, and exports `./*` from `dist/*.js` (`packages/protocol/package.json:11-16`), so a new
  `packages/protocol/src/branding.ts` is importable as `@getpaseo/protocol/branding` after `npm run build:client`.
  It holds plain constants only: no wire schema, no protocol change.
- Home default: `packages/server/src/server/paseo-home.ts:14-18` (`resolvePaseoHome`) is the choke point
  used by server, CLI and desktop. A private duplicate lives at `packages/cli/src/commands/hub/credentials.ts:139-143`.
- Port default: `packages/server/src/server/config.ts:38` (`DEFAULT_PORT`, used by `resolveListenAddress`
  `:466-481`), `persisted-config.ts:348` (`DEFAULT_PERSISTED_CONFIG.daemon.listen`),
  `packages/protocol/src/ssh-transport.ts:1` (`DEFAULT_SSH_DAEMON_PORT`),
  `packages/app/src/runtime/host-runtime.ts:1408` (`LOCALHOST_FALLBACK_ENDPOINT`),
  `packages/app/src/components/add-host-modal.tsx:319,577,668`.
- Deep links: `packages/protocol/src/agent-deep-link.ts:27` builds `paseo:/...`; `:39` rejects anything but
  `paseo:`. Callers: `cli/src/commands/open.ts`, `app/src/utils/host-routes.ts`, `desktop/src/agent-navigation.ts`, `desktop/src/main.ts`.
- Redaction: `packages/server/src/server/session/daemon/diagnostics.ts:559` and
  `packages/app/src/diagnostics/app-diagnostic-report.ts:114` match `/paseo:\/\/\S+/gi`.
- Env overrides (`PASEO_HOME`, `PASEO_LISTEN`, `PORT`) and the dev setup (`.dev/paseo-home`, 6768) flow
  through the same resolvers and keep working unchanged. Do not touch dev scripts.
- Workspace-local `.paseo/` markers (`app/src/utils/agent-grouping.ts:9` etc.) are a different concept. Leave them.

## Tasks

- [ ] 1. Create `packages/protocol/src/branding.ts` exactly per contract `brand-module`. Add
  `packages/protocol/src/branding.test.ts`: `brandUrl()` returns `https://zekoder.net`, `brandUrl("/docs/cli")`
  returns `https://zekoder.net/docs/cli`, and a path without a leading slash is normalized.
- [ ] 2. Home default: in `paseo-home.ts` replace `"~/.paseo"` with `` `~/${BRAND.defaultHomeDirName}` ``.
  Delete the private resolver in `cli/src/commands/hub/credentials.ts:139-143` and import `resolvePaseoHome`
  from `@getpaseo/server` (as `cli/src/utils/daemon-target.ts` does). Update help text
  "(default: ~/.paseo)" in `cli/src/utils/command-options.ts:12,28`.
- [ ] 3. Port default: `DEFAULT_PORT = BRAND.defaultDaemonPort` (`config.ts:38`); `persisted-config.ts:348`
  becomes `` `127.0.0.1:${BRAND.defaultDaemonPort}` ``; `DEFAULT_SSH_DAEMON_PORT = BRAND.defaultDaemonPort`;
  `LOCALHOST_FALLBACK_ENDPOINT` and the three `add-host-modal.tsx` values derive from `BRAND.defaultDaemonPort`;
  `cli/src/commands/onboard.ts:155,212` help text. Leave sample-data uses of 6767 in tests alone.
- [ ] 4. Deep links: `buildAgentDeepLink` emits `${BRAND.deepLinkScheme}:/...`; `parseAgentDeepLink` accepts
  `zekoder:` and `paseo:` (local `const ACCEPTED_SCHEMES`, comment that `paseo:` stays parseable for links
  produced by upstream daemons). Update `agent-deep-link.test.ts:14` expectation and add one case each:
  `zekoder://h/...` parses; `paseo://h/...` still parses; `other://h/...` rejected.
- [ ] 5. Redaction: both regexes become `/(?:paseo|zekoder):\/\/\S+/gi`. Add a `zekoder://` case next to the
  existing ones in `app/src/diagnostics/app-diagnostic-report.test.ts:111` and
  `server/src/server/session/daemon/daemon-session.test.ts:360`.
- [ ] 6. Update pinned-default tests: `server/src/server/persisted-config.test.ts:691,703,747,754,765` and the
  fallback-endpoint assertions in `app/src/runtime/host-runtime.test.ts:39-51` to `6777`.
- [ ] 7. Docs: `docs/development.md:30,49-52,65-71` — packaged app uses `~/.zekoder` and port `6777`; dev
  unchanged. Rewrite in place, CLAUDE.md doc voice. `server/.env.example:22,24` port comment.
- [ ] 8. `npm run build:client`, `npm run typecheck`, `npm run lint -- <changed files>`, `npm run format:files -- <changed files>`.

## Verification

One at a time, `--bail=1`, output to `/tmp/test-output.txt`:
`packages/protocol/src/branding.test.ts`, `packages/protocol/src/agent-deep-link.test.ts`,
`packages/server/src/server/persisted-config.test.ts`, `packages/server/src/server/session/daemon/daemon-session.test.ts`,
`packages/app/src/runtime/host-runtime.test.ts`, `packages/app/src/diagnostics/app-diagnostic-report.test.ts`,
`packages/desktop/src/agent-navigation.test.ts` (unchanged, must stay green).
`rg -n '"~/.paseo"' packages/*/src` returns nothing. No file under `packages/protocol/src` other than
`branding.ts`, `agent-deep-link.ts`, `ssh-transport.ts` and their tests changed.

## Progress

- Status: planned
- Notes:
