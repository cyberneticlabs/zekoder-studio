# Checklist

## Feature gates

- [x] User approved the proposed server-only yaml host extension design on 2026-10-15; implementation is not started.
- [ ] No-project connected-host OMP editing/test/import meets user request; no unrelated machine defaults writes.
- [ ] No literal credentials/raw YAML in read/preview/logs/errors or redirects; preview key action only, command keys never execute.
- [ ] Daemon allowlisted target/source/authority labels truthful; unresolved profile targets never guessed, default editing has no OMP-install/auth prerequisite.
- [ ] Read-only Preview/Cancel never writes; Save uses exact reviewed operations/revision, invalidates stale review and re-reads state.
- [ ] Existing typecheck/lint/format and changed-file tests pass; existing CI covers packaging.

## 01-providers

- [ ] Compiler/runtime host injection works with external desktop resources and rejects client/shared yaml.
- [ ] Plugin requirements.paseo and automatically generated release requires.paseo name the first actual supporting host release; older host update/load rejection is tested before publication.
- [ ] Explicit Remove key deletes apiKey; omitted key preserves it; backup symlink sentinel remains untouched.
- [ ] YAML unknown nodes, comments, model metadata and key preservation covered.
- [ ] Conflict/serialized writes/backup/symlink/mode and error cleanup verified with temporary files.
- [ ] Local HTTP Test/import safety and no-project UI evidence recorded; unsaved imports stage only, key-deletion draft never silently uses stored key.
- [ ] Host/harness/target switches isolate drafts/query/pending results; secret sentinels and invalid-shape fixtures pass.
- [ ] README and owning built-in dependency docs updated; built-in reload guidance correct.
