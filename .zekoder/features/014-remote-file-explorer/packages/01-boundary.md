# Package 01 — Boundary
Branch 024-remote-file-explorer-01-boundary. Depends on none. Blocked by external task 1. Owns project-filesystem/confined-host-files; consumers 02,03.

## Setup/context
Supervisor creates worktree from its staging branch: git worktree add /tmp/024-01 -b 024-remote-file-explorer-01-boundary; cd /tmp/024-01/paseo; npm ci. Read ../docs/paseo-plugin-project-scope.md, ../docs/paseo-plugin-explorer-panel.md and ../.zekoder/features/024-remote-file-explorer/contracts.md from the paseo directory. Before coding, external task 1 must become concrete public signatures/version/platform support with approved architecture.
Reuse defineRpc/zod in shared/git.ts, server.handle in index.server.ts, shared/errors.ts. paseo.workspaces.ref(workspaceId).refresh() gives authoritative descriptor; verify projectId/projectRootPath against paseo.projects.list(). Boundary is projectRootPath, never directory. Ordinary registered projects supported; assertZekoderProject and Git common-dir checks unsuitable.

## Task
- [ ] 1. Implement approved confined filesystem/listing in paseo/server/project-files.ts and server/explorer.ts, project-filesystem schema in shared/explorer.ts, and handler registration in index.server.ts. Derive fresh root, reject missing/archived/mismatched workspaces and invalid components, classify links/special files without following, close handles, fail closed if capability absent. Add meaningful server/project-files.test.ts using actual approved primitive and deterministic swap fixture. No unrestricted Node path fallback/MCP change.

## Verification
cd paseo && npm run typecheck. Focused Node harness with temporary emitted JS via existing TypeScript toolchain, no new framework: forged roots/absolute/drive/UNC/backslash/NUL/parent paths, nested/root symlinks, unknown workspace, external worktree, concurrent root and intermediate-directory swap for list/read/create. Outside sentinel unread/unmodified. Direct forged RPC calls too. Exact harness command finalized with approved primitive before coding, not assumed existing.

## Progress
Tasks done: pending. Verification done: pending. Ready for review: pending.
