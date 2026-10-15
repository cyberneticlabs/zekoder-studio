# Plugin auto-update publishing — Get Started

## Prerequisites

- Node 22, npm, GNU or BSD `tar`, git. Paseo app with the `paseo` CLI for the UI check.
- Live release only: external dependencies 1 and 2 done.

## Run commands

```bash
cd plugins/zekoder && npm ci && npm run typecheck
node scripts/plugin-release.mjs check-tag v0.12.0
node scripts/plugin-release.mjs build 0.12.0 /tmp/plugin-out
cd plugins/zekoder && paseo plugin install "$PWD"   # first time; later: paseo plugin reload zekoder
```

## Manual walkthrough

1. Run `check-tag v0.12.0` → prints `0.12.0 stable`. `check-tag v0.12.0-beta.1` → `0.12.0 beta`. `check-tag v0.12.0-rc.1` → non-zero exit.
2. Run `build 0.11.1 /tmp/out --src /tmp/p0111/paseo` (after `git worktree add /tmp/p0111 v0.11.1`) → `treeChecksum` equals Studio lock `1b15aecc…c43c97`.
3. `keygen` a throwaway key to `/tmp` (printed `publicKey` is 44-char base64 = 32 bytes), add it to a local (uncommitted) keyring, run `next --current -` → `sign` → `verify` → verify passes and shows `sequence: 1`, `channels.stable: "0.12.0"`; the entry has `requires.paseo: ">=0.9.2"`. Repeat `next` with the same release → `unchanged`.
4. Edit one byte of the envelope payload → `verify` fails.
5. `revoke --version 0.12.0 --reason test` on that envelope, sign, verify → `channels.stable` is `null`, `sequence: 2`.
6. Reload the plugin in plain Paseo, open Zekoder → Version → "Zekoder plugin 0.12.0 · Unknown" and "Unknown — host does not report plugin updates". (Desktop-managed, restart-required, fallback and array-pick rows: package 02 stub cases for `pluginUpdates.status("zekoder")`.)
7. Live (after deps 1+2): push tag `v0.12.0-beta.1` → workflow green; `curl -s https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json` returns the envelope; artifact URL downloads and its sha256 matches; `releases/manifest.json` generation is unchanged. Re-run the same workflow → green with `unchanged`, manifest generation unchanged.

## Integration-test mapping

| Walkthrough step | Automated test |
|---|---|
| 1–5 | needs manual check (no test suite in repo; script commands are the check) |
| 6 | needs manual check (Paseo UI) |
| 7 | GitHub Actions run of `plugin-release.yml` |
