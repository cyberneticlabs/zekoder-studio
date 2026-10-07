# Get started — 002-zekoder-rebrand

## Prerequisites

- Node 22+, `npm install` done, `npm run build:client` current.
- Never touch the main daemon on :6767. Use `npm run dev` (dev daemon :6768, `.dev/paseo-home`).

## Run

```bash
npm run build:client
npm run dev            # dev daemon
npm run dev:app        # Expo web/native against the dev daemon
npm run dev:desktop    # Electron dev
node branding/generate-assets.mjs --check
```

## Manual walkthrough

1. Open the web app from `npm run dev:app` in a browser, light OS theme → tab favicon is the blue `{ :) }` mark.
2. Switch the OS to dark theme → favicon is the white mark.
3. Start an agent → favicon shows the blue status dot bottom-right; when it needs a permission → green dot.
4. Disconnect from all hosts → welcome screen shows "Welcome to Zekoder", the tinted mark, and a `zekoder.net` link that opens `https://zekoder.net`.
5. Sidebar help menu → app name reads "Zekoder". Settings → Integrations → CLI docs link opens `https://zekoder.net/docs/cli`.
6. Desktop dev window → title "Zekoder (<worktree>)", dock icon is the mark on a white rounded tile with transparent margin. Settings → desktop updates: a manual check reports no update (auto-update gated off).
7. After `npm run build:client`: `node -e "import('@getpaseo/protocol/agent-deep-link').then(m => console.log(Object.keys(m)))"` lists the builder; calling `buildAgentDeepLink` with a server and agent id returns a URL starting `zekoder://h/`.
8. After `npm run build:server`, in a shell with `PASEO_HOME` unset: `env -u PASEO_HOME node -e "import('@getpaseo/server').then(m => console.log(m.resolvePaseoHome(process.env)))"` prints `$HOME/.zekoder`. The 6777 listen default is covered by `persisted-config.test.ts`; do not start a daemon on a default port.
9. `cd packages/app && npx expo config --json` → `name` Zekoder, `scheme` zekoder, `ios.bundleIdentifier` and `android.package` `net.zekoder.app`; with `APP_VARIANT=development` → `Zekoder Debug`, `net.zekoder.app.debug`.

## Integration-test mapping

| Step                    | Covered by                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-3                     | `branding/generate-assets.test.mjs` (pixels, dot color); favicon swap logic unchanged                  |
| 4-5                     | `packages/app/src/i18n/resources.test.ts`                                                              |
| 5 links                 | `packages/protocol/src/branding.test.ts`                                                               |
| 7                       | `packages/protocol/src/agent-deep-link.test.ts`                                                        |
| 8                       | `packages/server/src/server/persisted-config.test.ts`, `packages/app/src/runtime/host-runtime.test.ts` |
| 6, 9, desktop packaging | `packages/desktop/src/daemon/desktop-packaging.test.ts`; packaged smoke and nix in CI                  |
