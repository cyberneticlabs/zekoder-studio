# Checklist

## Feature gates

- [x] User approved the proposed server-only yaml host extension design on 2026-10-15; implementation is not started.
- [ ] No-project connected-host OMP editing/test/import meets user request; no unrelated machine defaults writes.
- [ ] No credentials in RPC read responses/logs/errors or redirects; command keys never execute.
- [ ] Existing typecheck/lint/format and changed-file tests pass; existing CI covers packaging.

## 01-providers

- [ ] Compiler/runtime host injection works with external desktop resources and rejects client/shared yaml.
- [ ] Plugin requirements.paseo and automatically generated release requires.paseo name the first actual supporting host release; older host update/load rejection is tested before publication.
- [ ] Explicit Remove key deletes apiKey; omitted key preserves it; backup symlink sentinel remains untouched.
- [ ] YAML unknown nodes, comments, model metadata and key preservation covered.
- [ ] Conflict/serialized writes/backup/symlink/mode and error cleanup verified with temporary files.
- [ ] Local HTTP Test/import safety and no-project UI evidence recorded.
- [ ] README and owning built-in dependency docs updated; built-in reload guidance correct.
