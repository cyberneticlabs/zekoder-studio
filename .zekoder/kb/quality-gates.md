# Quality gates detail

- lefthook pre-commit (lefthook.yml): format:check on staged files, lint on staged js/ts, full typecheck.
- Lint: oxlint (`npm run lint`, `lint:fix`). Format: oxfmt. Unused code: `npm run knip`.
- Typecheck: `npm run typecheck` (all workspaces); server subset `npm run typecheck:server`.
- Cross-package type errors: rebuild declarations (`build:client`, `build:server`) before diagnosing; never patch inferred types locally.
- Tests: vitest; run single file with `npx vitest run <file> --bail=1`, output to a file. Full suites are heavy and freeze the machine; rely on CI (GitHub Actions).
- QA evidence bar for PRs: docs/qa.md. Mobile: docs/mobile-testing.md.
- Release check: `npm run release:check` (not for routine work).
