# Unified release channel and update-restart notice — Get Started

## Prerequisites

- Packages 01-03 and bug 013 merged; `npm install`, `npm run build:server`.
- Dev daemon only (port 6768, `.dev/paseo-home`). Never touch the main daemon on 6767.
- A second host built from `main` before package 01 (or a stock upstream daemon) for the old-host checks.
- Built-in updater checks need a desktop-managed daemon (`npm run dev:desktop`); a beta plugin release in the manifest for steps 3-5.

## Run commands

```bash
npm run dev            # dev daemon on 6768
npm run dev:desktop    # Electron against the dev daemon
```

## Manual walkthrough

1. Settings → About → Connected hosts → each connected host row shows a Stable/Beta control; the Desktop app update row has no Release channel control.
2. Switch the local host to Beta → `.dev/paseo-home/config.json` has `"releaseChannel": "beta"` at once; desktop settings `releaseChannel` becomes `beta`.
3. Within seconds the built-in updater checks on Beta (`plugin.updates.get_status` channel `beta`) and stages the beta plugin.
4. Within about 1-2 minutes of staging → sidebar shows "Update ready — restart daemon" for that host; Settings → Host shows the same notice.
5. Click "Restart daemon" → confirmation says running agents stop and history is kept; Cancel does nothing; Confirm restarts and the notice clears once the new plugin runs.
6. Zekoder sidebar → Version tab → "Channel: Beta (skills: dev) · Change in Settings → About"; no chips; "Check now" picks the dev skills release.
7. After a background skills install → Version tab shows the "Skills updated to X" reconnect note.
8. Old host in Connected hosts → "Update this host to change its channel.", no control.
9. Desktop with no local daemon → Desktop app update row shows the Stable/Beta control.
10. Host with legacy plugin setting `dev` and no stored channel → after the first plugin tick the host's channel is Beta and the legacy setting reads `stable`.

## Integration-test mapping

| Walkthrough step | Automated test |
|---|---|
| 1, 8, 9 | needs manual check |
| 2 | daemon-config-store test (01); local channel sync decision test (02) |
| 3 | `packages/server/src/server/plugins/builtin/updates/index.test.ts` (01) |
| 4 | restart-ready selector test (02) |
| 5 | needs manual check (`daemon-lifecycle.test.ts` covers the restart helper) |
| 6, 7 | needs manual check |
| 10 | plugin channel helper test (03) |
