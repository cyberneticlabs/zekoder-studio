---
id: 008-lint-zekoder-plugin-source
type: followup
title: Lift the oxlint ignore for plugins/zekoder
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:08:25.159Z
updatedAt: 2026-10-15T16:09:48.063Z
completedAt: 2026-10-15T16:09:48.063Z
origin: zekoder-coding-agent
filedFromTask: 008-plugin-source-consolidation-01-in-repo-source
branch: followup-008-lint-zekoder-plugin-source
promoted: false
packages: []
mergeMode: local
commit: 1bcac1e4b004bf4455b1faa138180214377ec1e7
filesTouched:
  - .oxlintrc.json
  - plugins/zekoder/client/agent-branch-pills.ts
  - plugins/zekoder/client/agent-defaults.tsx
  - plugins/zekoder/client/coding-health-tab.tsx
  - plugins/zekoder/client/config-panel.tsx
  - plugins/zekoder/client/git-panel.tsx
  - plugins/zekoder/client/git-tab.ts
  - plugins/zekoder/client/health-charts.tsx
  - plugins/zekoder/client/issues-tab.tsx
  - plugins/zekoder/client/machine-defaults-panel.tsx
  - plugins/zekoder/client/start-agent-button.tsx
  - plugins/zekoder/client/tab-bar.tsx
  - plugins/zekoder/client/version-panel.tsx
  - plugins/zekoder/server/config.ts
  - plugins/zekoder/server/mcp-client.ts
  - plugins/zekoder/server/org-health-cli.ts
  - plugins/zekoder/server/reports.ts
  - plugins/zekoder/server/role-variants.ts
  - plugins/zekoder/server/version.ts
  - plugins/zekoder/server/zekoder.ts
  - plugins/zekoder/shared/config.ts
  - plugins/zekoder/shared/issues.ts
  - plugins/zekoder/shared/reports.ts
  - plugins/zekoder/shared/version.ts
verifiedBaseSha: f58a1ca0c414dd23127da8b26d1c7421100afdc5
relatedFeatures:
  - 008-plugin-source-consolidation
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T16:09:48.063Z
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
