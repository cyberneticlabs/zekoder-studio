# Plugin auto-update publishing — Checklist

## Feature-level gates

- [ ] All packages merged
- [ ] `cd plugins/zekoder && npm run typecheck` green on the base branch
- [ ] get-started.md steps 1–6 executed
- [ ] No private key, `.pem` or secret value committed
- [ ] Nothing writes `releases/` or `desktop/` in the bucket
- [ ] `plugins/zekoder/paseo-plugin.json` has no new keys (Studio schema is strict)
- [ ] contracts.md and external-dependencies.md (changes and requests in 3 and 4) handed to Studio 004

## Package 01 — Release pipeline

- [ ] `check-tag` accepts only the stable/beta regex and matching versions
- [ ] Tree checksum parity with Studio lock for v0.11.1
- [ ] Keyring holds raw base64 32-byte keys; sign/verify round trip passes; tampered payload fails; single signature, no `_NEXT` key
- [ ] Release entries carry `requires.paseo`; re-run with same artifact/commit/requires is `unchanged`; changed bytes abort
- [ ] Workflow: `fetch-depth: 0`; artifact upload never overwrites; manifest written last with generation match; 412 → re-read and recompute (bounded)
- [ ] `docs/plugin-release.md` covers custody, tag ruleset, accepted risk, compromise, revocation, re-running a cancelled run; rotation points at followup `002-plugin-signing-key-rotation`

## Package 02 — Version tab plugin card

- [ ] Card shows `runningVersion` + source; "Unknown — host does not report plugin updates" when `pluginUpdates.status` is absent or returns `null`
- [ ] `enabled:false` shows "Updates are managed by the desktop app"
- [ ] "Restart the daemon to apply (Settings → Host → Restart daemon)" from `restartRequired` (incl. rollback to bundled), derived from `stagedVersion` only when absent; no restart button, no restart RPC
- [ ] Calls `paseo.pluginUpdates.status("zekoder")` (plain string); picks the `pluginId === "zekoder"` entry from the array (object / `null` tolerated); status parsed per contract `builtin-plugin-update-status`; `channel` shown as reported (no plugin channel setting)
- [ ] Error, fallback (`previously-failed`), latest rows render from a stubbed flat status; unknown code shown verbatim; bad payload does not crash
- [ ] Skills/MCP version section unchanged
- [ ] `plugins/zekoder/README.md` updated
