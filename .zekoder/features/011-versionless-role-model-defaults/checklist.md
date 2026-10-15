# Checklist — 011-versionless-role-model-defaults

## Feature-level gates

- [ ] Feature 010 merged before package 01 starts
- [ ] Package 01 merged
- [ ] `cd plugins/zekoder && npm run typecheck` green on staging/base
- [ ] `get-started.md` walkthrough run (steps 3–4 and 6–7 after external dependency 1)
- [ ] No `roleDefaults` or snapshot logic added

## Package 01 — Family defaults and launch resolution

- [ ] Family options show in session and role model dropdowns for claude and codex only
- [ ] Stored value stays the family name after a launch
- [ ] Family launch calls `--resolve-model` before `agents.create`; exact IDs and `inherit` do not
- [ ] Old/missing resolver fails the launch at any tier with `Model <value> (from <source>): Needs a newer zekoder-skills (no --resolve-model).`
- [ ] Resolver ran but gave no usable match: soft skipped quietly, strict fails
- [ ] Claude role pre-write passes the resolved ID to the materializer
- [ ] Family effort list = union over that family's own models
- [ ] Effort checked on the resolved model with 010's soft/strict rule
- [ ] `README.md` matches the UI and launch behavior
