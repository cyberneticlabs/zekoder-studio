# Conventions

Authoritative: docs/coding-standards.md, docs/glossary.md (UI label wins), docs/design.md.

- Platform gating: `isWeb`/`isNative` from `@/constants/platform`, `getIsElectron()`, `useIsCompactFormFactor()`. Prefer `.web.ts`/`.native.ts`/`.electron.tsx` file extensions over big if-blocks.
- No `onPointerEnter/Leave`; hover pattern in docs/hover.md.
- `useUnistyles()` is forbidden (docs/unistyles.md).
- Protocol: new fields optional, no `.transform/.catch/.preprocess`; shims tagged `// COMPAT(name): added in vX, remove after <date>`.
- New RPCs: dotted namespace + `.request`/`.response` (docs/rpc-namespacing.md).
- Tests: add to existing suites, real deps over mocks (docs/testing.md).
- Formatting by oxfmt via `npm run format`; do not hand-fix.
- Docs: integrate into owning doc, no appended paragraphs (CLAUDE.md Writing docs).
- Release branch: "this goes to next" means PR targets `next` (docs/release.md).
