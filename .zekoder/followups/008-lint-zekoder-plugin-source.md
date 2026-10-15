---
id: 008-lint-zekoder-plugin-source
type: followup
title: Lift the oxlint ignore for plugins/zekoder
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T15:08:25.159Z
updatedAt: 2026-10-15T15:08:25.159Z
origin: zekoder-coding-agent
filedFromTask: 008-plugin-source-consolidation-01-in-repo-source
branch: followup-008-lint-zekoder-plugin-source
promoted: false
packages: []
relatedFeatures:
  - 008-plugin-source-consolidation
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Lift the oxlint ignore for plugins/zekoder

`.oxlintrc.json` still lists `plugins/zekoder/**` in `ignorePatterns`. Package 01 of feature 008 moved the plugin source in-repo and lifted the oxfmt and knip ignores, but removing the oxlint ignore reports 485 errors (limit set by the plan was ~30), so the ignore stays.

## Breakdown (npm run lint -- plugins/zekoder with the ignore removed)

- 329 `react-perf/jsx-no-new-object-as-prop`
- 80 `react-perf/jsx-no-new-function-as-prop`
- 14 `react-perf/jsx-no-new-array-as-prop`
- 11 `no-nested-ternary`, 10 `preserve-caught-error`, 9 `consistent-type-definitions`, 7 `complexity`, 5 `react/no-unescaped-entities`, plus a handful of others.

## Work

- Decide per rule: fix, or scope an override for `plugins/zekoder/client/**` (the react-perf rules dominate and are style churn in a plugin UI).
- Remove `plugins/zekoder/**` from `.oxlintrc.json` `ignorePatterns` once `npm run lint` is clean.
