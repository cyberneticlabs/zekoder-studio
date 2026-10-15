---
id: 014-remote-file-explorer
type: feature
title: Project-bound remote file explorer
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:29.621Z
updatedAt: 2026-10-15T15:21:43.973Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: boundary
    file: packages/01-boundary.md
    branch: 024-remote-file-explorer-01-boundary
    dependsOn: []
    status: planned
  - id: "02"
    name: transfers
    file: packages/02-transfers.md
    branch: 024-remote-file-explorer-02-transfers
    dependsOn:
      - "01"
    status: planned
  - id: "03"
    name: explorer
    file: packages/03-explorer.md
    branch: 024-remote-file-explorer-03-explorer
    dependsOn:
      - "01"
      - "02"
    status: planned
contracts:
  - id: project-filesystem
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "02"
      - "03"
  - id: file-transfers
    type: internal
    kind: edge-function
    owner: "02"
    consumers:
      - "03"
  - id: confined-host-files
    type: cross-system
    counterpart: Paseo public plugin SDK/daemon maintainers
    externalDependency: 1
    owner: "01"
    consumers:
      - "02"
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
statusHistory: []
---
> Imported from cyberneticlabs/zekoder-plugins feature 024-remote-file-explorer (feature 008-plugin-source-consolidation). Needs re-plan against zekoder-studio before execution.

# Project-bound remote file explorer

## User's request (verbatim)
> we need a new workspace type, that opens a tab to emulate GUI explorer, it is useful to browse file in remote hosts. Browsing should be not go beyond the current project boundary e.g. no following for symlinks and not allowed to go up levels
> User is allows to browse folder files, open files e.g. md, js, ..etc like the opening from the file browser side panel. The main difference is that, user is allowed to upload files directly the host via the UI, and un-tar, un-zip by right click

## Refined scope
Desktop/web Explorer tab using existing workspace-panel API. Browse folders with breadcrumbs, upload local single files to selected folder, right-click ZIP/TAR to extract into a new sibling folder. Server resolves workspaceId to registered projectRootPath each call; external worktrees browse that root rather than their external directory. Display root clearly. No parent escape or symlink traversal for any operation; symlinks disabled. Create-only uploads/extraction; collisions fail without overwrite.
Native file opening postponed: SDK 0.9.2 lacks public native-viewer API. No custom viewer/read-file RPC.

## Out of scope
Mobile, new host workspace model, rename/delete/move/edit, folder uploads, drag-and-drop, overwrite, extraction into existing folders, compressed TAR, archive links/devices, custom viewer, automatic tab opening, MCP source changes.

## Packages
| ID | Name | File | Branch | Depends on |
|---|---|---|---|---|
| 01 | boundary | packages/01-boundary.md | 024-remote-file-explorer-01-boundary | none |
| 02 | transfers | packages/02-transfers.md | 024-remote-file-explorer-02-transfers | 01 |
| 03 | explorer | packages/03-explorer.md | 024-remote-file-explorer-03-explorer | 01, 02 |

Graph: 01 → 02 → 03; 01 also supplies 03 listing. Exactly three implementation tasks, one per package.

## Related bugs & followups
None overlap. Open 001-plugin-signing-key-rotation remains separate. Merged 002-replace-unzip-with-node-extraction supplies parser context, not dependency/fold. Features 022/023 remain separate; preserve shared entrypoints. No relevant decision; 001-three-tier-agent-defaults accepted search hit is unrelated.

## Open assumptions / blockers
Not ready for autonomous execution. External tasks 1–3 must resolve blocked packages before coding. SDK/public docs lack picker/right-click API and proven race-safe confined file operations. Proposed cross-system semantics in contracts.md are requirements, not invented available method names.
Plain lstat/realpath plus final O_NOFOLLOW cannot prevent intermediate directory swaps. User must approve host confinement mechanism/platform support or explicitly revise guarantee; no silent weaker fallback/native helper. Host public API choices must be finalized with signatures/versions before implementation. New tar-stream dependency needs human review.
Missing capabilities fail closed, but unavailable-state UI does not fulfill required upload/right-click behavior.

## Acceptance
Approved-capability desktop/web opens Explorer via workspace +; project-bound folders, bounded uploads and safe ZIP/TAR extraction work. Forged paths and deterministic symlink races never read/write outside root. Native opening clearly deferred without alternate viewer.
