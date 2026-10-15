# Package 02 — Transfers
Branch 024-remote-file-explorer-02-transfers. Depends on 01. Blocked by external task 3 and transitively 1. Owns file-transfers; consumes project-filesystem/confined-host-files.

## Setup/context
After 01 lands in staging: git worktree add /tmp/024-02 -b 024-remote-file-explorer-02-transfers; cd /tmp/024-02/paseo; npm ci. Read ../docs/paseo-plugin-project-scope.md, ../docs/paseo-plugin-explorer-panel.md and ../.zekoder/features/024-remote-file-explorer/contracts.md from the paseo directory. Existing server/unzip.ts decoder has CRC/stored/deflate/path checks but extractZip follows existing symlinks, unbounded inflation and chmod. Reuse/factor decoder with bounded API; preserve release caller extractZip signature/behavior. Approved tar-stream decoder is server-only; lock npm versions after review.

## Task
- [ ] 2. Implement create-only bounded upload/extraction in paseo/server/explorer-transfers.ts and server/archive.ts; schemas shared/explorer.ts; registrations index.server.ts. Canonical base64 limits before allocation. Validate complete ZIP/TAR entry manifest before output, normalize parser-decoded TAR names, reject absolute/parent/drive/UNC/NUL/backslash, links/devices/FIFO, duplicates/type conflicts, encrypted/ZIP64/unsupported formats. Enforce actual decompression/file/count/depth bounds. Read/create/owned cleanup solely via 01 confinement. New sibling output, no overwrite/executable propagation; cleanup errors accurately report partial output. Focused server/archive.test.ts and explorer-transfers.test.ts with real confinement fixture.

## Verification
Typecheck plus 01's finalized Node harness command. Safe nested ZIP/TAR, empty/binary upload and content equality; collisions preserve bytes. Bad CRC/truncation/header, size/count/depth bombs, escaping/link/special entries and conflicts reject with no published output; cleanup failure honest. Deterministic path swaps never affect outside sentinel. Representative release ZIP still extracts. No shell tar/unzip, HTTP service, resume protocol or general test framework.

## Progress
Tasks done: pending. Verification done: pending. Ready for review: pending.
