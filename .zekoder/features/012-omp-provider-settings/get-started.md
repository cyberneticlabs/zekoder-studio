# Get started

Use Node22+, npm and the root workspace install. Read docs/zekoder-plugin.md. Run npm run build:client if declarations are stale, then npm run typecheck and npm run lint.

1. Start an isolated dev daemon and app using docs/development.md; use temporary HOME/config fixtures. Close all projects -> Zekoder page remains available.
2. Open Providers -> harness dropdown shows OMP and a missing-file empty state.
3. Inspect the resolved target/source label and authority notices. Add a provider/model, enter URL and optional key, Preview -> sanitized field/model changes and key action only, no file created. Cancel -> unchanged filesystem; Preview again -> explicit Save -> models.yml created0600, re-read state and OMP restart note.
4. Load a fixture with comments/discovery/model metadata and unknown api -> edit one model -> untouched semantic fields/comments remain.
5. Choose Remove key then Preview/Save -> apiKey is deleted; leave the field blank on an ordinary Save -> existing key retained. With a local HTTP fixture, Test -> model ids -> import selected ids once; change URL without typing a key -> explicit key-required error; redirect -> controlled failure.
6. Modify file externally after Preview -> Save -> conflict retains draft and invalidates review; choose reload -> fresh values shown and new Preview required. Stage/import changes -> previous preview invalidated, no automatic save.
7. Switch host/target while read/preview/Test is pending -> stale results/drafts never transfer. Test current unsaved draft -> ids stage edits only; pending Remove key cannot reuse stored key silently. Reload app and inspect compact/native layout; keys remain masked unless env/command references are recognized. Default config editor works without installed/enabled OMP; unresolved custom profile shows an authority limitation.

| Evidence | Existing harness |
| --- | --- |
| YAML/write/HTTP safety | plugins/zekoder/server/providers.test.ts, root Vitest discovery |
| Server-only YAML in packaged mode | compiler tests and usage-sources.e2e.test.ts |
| No-project UI and errors | packages/app/e2e/browser/plugin-settings.spec.ts, existing browser fixtures |
| Desktop distribution | scripts/builtin-plugins-dist.test.mjs and existing packaged smoke CI |

After built-in source edits, restart the isolated dev daemon and reload app; plugin reload is unavailable for built-ins. Never restart the main6767 daemon.
