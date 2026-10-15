# Contracts

## project-filesystem
Internal; kind store; owner 01; consumers 02,03. Files paseo/shared/explorer.ts and paseo/server/project-files.ts.
RPC inputs {workspaceId,path}; path empty means root. Reject absolute/drive/UNC/backslash/NUL and . or .. segments; fileName one component.
listDirectoryRpc output {rootLabel,path,entries:[{name,kind:"directory"|"file"|"symlink"|"other",size:number|null}],capabilities:{upload:boolean,extract:boolean},limits:{maxUploadBytes,maxArchiveBytes,maxExpandedBytes,maxEntries}}. Directories first then name ordering; disabled symlink/special rows. Listing over 10,000 entries returns explicit limit error.
Server withProjectRoot(paseo,workspaceId,operation) refreshes workspace, matches registered project and derives projectRootPath, opens approved confined handle and closes after callback. Callback may list/read regular file/create exclusive file/create exclusive directory subtree/clean operation-owned output, never unrestricted absolute writer. Unknown/archived workspace denied; directory does not widen boundary.
Errors invalid-path, workspace-unavailable, unavailable-capability, symlink-denied, unsupported-type, collision, limit-exceeded, io-error; existing errorText for display.

## file-transfers
Internal; kind edge-function; owner 02; consumer 03. Schemas shared/explorer.ts; handlers server/explorer-transfers.ts.
uploadFileRpc input {workspaceId,path,fileName,base64}; output {name,bytes}. Canonical base64, decoded ≤8 MiB; encoded ≤11,184,812 characters checked before allocation. Sequential one-shot files; no resume/session.
extractArchiveRpc input {workspaceId,path,fileName}; output {folderName,files,bytes}. Source ≤8 MiB; actual expanded total ≤64 MiB; ≤2,000 entries; each file ≤16 MiB; depth ≤32. ZIP stored/deflate; uncompressed TAR regular files/directories.
Destination filename removes .zip/.tar suffix; empty stem becomes extracted. New sibling directory only; existing destination collision. Validate complete manifest before output. Reject duplicate/file-directory conflicts, escaping names, symlink/hardlink/special types. Bound actual emitted bytes. Default non-executable permissions; no overwrite. Cleanup only operation-owned output via confined API; report residual partial directory honestly.

## confined-host-files
Cross-system; owner 01; consumers 02; counterpart Paseo public plugin SDK/daemon maintainers; externalDependency 1.
Required semantics, not current method names: authoritative project-root handle supporting no-follow list/read/create/owned cleanup, intermediate/final link rejection, containment under concurrent directory replacement, exclusive creation and explicit unsupported-platform failure.
External task 1 delivers public imports/signatures/runtime versions and adversarial race evidence. Revise this proposal to concrete API before coding; no private host/raw DaemonClient fallback.
