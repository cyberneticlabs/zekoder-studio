# Checklist

## Feature gates

- [x] User approved the plan and coordinated shared installation/migration architecture on 2026-10-15; no implementation started.
- [ ] External dependencies1/2 exact releases and interoperability evidence supplied; execution blocker lifted explicitly.
- [ ] Canonical tooling user-scoped; repo plans/KB/config/identity/variants remain local.
- [ ] Status/dry-run read-only including receipts; interrupted status reports only, mutation recovers under shared lock; no automatic migration or stamp-only readiness.
- [ ] Dry-run preview shows predicted proven-owned changedPaths and separate conflicts; apply returns actual committed changedPaths.
- [ ] Atomic payload+wiring+ownership rollback and explicit override precedence verified.

## 01-shared-runtime

- [ ] One shared job, zero-project UI, per-harness diagnostics and reload guidance.
- [ ] Selected known-root migration only; ownership conflicts and outside shadows preserved.
- [ ] Strict plugin launches gate readiness; generic hook remains bounded/fail-open.
- [ ] MCP/whole pool/org-health/role helper refresh happens on successful commit only.
- [ ] Coordinated real-release smoke, focused temporary-files tests and existing browser fixture pass.
- [ ] Root typecheck/lint/format and changed tests pass; README/owning docs updated.
