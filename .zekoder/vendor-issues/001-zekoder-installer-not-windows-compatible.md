---
id: 001-zekoder-installer-not-windows-compatible
type: vendor-issues
title: zekoder-skills installer (get.sh/install.sh) does not run on Windows
status: resolved
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:40.308Z
updatedAt: 2026-10-15T15:20:54.549Z
completedAt: 2026-10-15T15:20:54.549Z
externalSystem: cyberneticlabs/zekoder-skills
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
statusHistory:
  - from: open
    to: resolved
    at: 2026-10-15T15:20:54.549Z
---
> Imported from cyberneticlabs/zekoder-plugins vendor-issue 001-zekoder-installer-not-windows-compatible (feature 008-plugin-source-consolidation).

# Vendor issue 001-zekoder-installer-not-windows-compatible: zekoder-skills installer (get.sh/install.sh) does not run on Windows

> **Not queued for autonomous implementation.** This is informational — it needs the user or an
> external team to act. No zekoder-coding-agent will pick this up.


## Summary

The zekoder-skills installer needs bash, jq, symlinks, readlink and `sort -V`, so it cannot run on Windows, and the Paseo plugin's auto-install fails there.

## What's needed from them

A cross-platform Node installer, `scripts/get.mjs` (plus Node install logic):

- Same CLI: `[--force] [--harnesses ...] [--mcp-home /abs] <target>`.
- Same env: `ZEKODER_SKILLS_REPO`, `ZEKODER_CACHE_DIR`.
- Same steps and exit codes as `get.sh`.
- Node built-ins only (no jq, no bash).
- Execution-profile links (`.zekoder-execution-profiles/`) fall back to junctions (dirs) or copies (files) on Windows, and the drift check accepts them.
- Keep `get.sh` working, or make it a thin wrapper over the Node installer.
- Tests, plus a `windows-latest` CI job if possible.

Open question for them: is the plugin's sparse cache set (`zekoder.json`, `mcp/dist`, `scripts`, `skills`, `agents`, `commands`, `harnesses`, `runtime`, `dist`) enough for `get.mjs`?

Upstream status: proposal sent 2026-10-03 to the zekoder-skills Claude session (zekoder-skills-11), asking it to file a feature via `/zekoder-plan`. No confirmation yet.

## Supporting evidence / repro

The Paseo plugin owns zekoder install/update (commit 6017bf4 on main). `plugins/zekoder/server/version.ts` spawns `bash <cache>/scripts/get.sh <dir>` (`GET_SCRIPT` at line 26, `spawn("bash", ...)` at line 319) for every Paseo project root and open worktree. On Windows this cannot work:

- No bash on plain Windows.
- `jq` is required by `get.sh`, `install.sh` and `zekoder-versioning.sh`; Git Bash does not ship jq.
- `install.sh` uses `ln -sfn` for `.zekoder-execution-profiles/` links, which needs Developer Mode or admin on Windows.
- `get.sh` uses `readlink` and `sort -V`.

Repro:

1. Run the Paseo daemon on Windows with the plugin installed.
2. Open Zekoder, then Version, then Check now.
3. Each project's install job fails (bash not found / "jq is required").

Expected: the plugin auto-installs zekoder on Windows like on macOS/Linux. Actual: every install job fails.

Local follow-up (separate, not part of this item): once `get.mjs` ships, `plugins/zekoder/server/version.ts` runs `node get.mjs <dir>` when present, else `bash get.sh`. An optional interim Windows guard in the plugin is not done yet.
