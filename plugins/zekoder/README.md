# Zekoder plugin

A [Zekoder](https://paseo.sh/docs/plugins) plugin that adds three sidebar links, in this order:
**Issues**, **Reports**, and **Zekoder** (global settings), plus per-project workspace tabs **Zekoder issues** and **Zekoder settings** in the workspace "+" menu,
and a **Git** tab for the workspace's right (explorer) panel, next to Files and Changes. Open it with
the Git button in the workspace header, the Command Center item **Open Git panel** (Cmd+K), or the
right panel's new-tab launcher. (Zekoder's "Open in" menu — editors, GitHub, Finder — takes no
plugin entries, so the header button is the visible way in.)

The **Issues** page lists every work item (features, bugs, followups, vendor issues, decisions, ideas) in a
Zekoder project's `.zekoder/` workspace, with:

- **Filter** by status (Open / Done / All) and by item type
- **Search**: ranked full-text search via `zekoder_search`
- **Project picker**: shown when more than one Zekoder project has a `.zekoder/` workspace
- **Detail panel**: click an item to see its metadata, relations, documents, and packages
  (count plus expandable per-package details) via `zekoder_get_item`. It opens as a side panel on
  wide layouts and as a modal on compact ones.
- **Document viewer**: documents are listed by name. Click one (or a package's document) to read
  it in view mode. The server only reads `.md` files inside the project's `.zekoder/`.
- **Implement**: a button in the detail panel of a feature, bug or followup. It is enabled only
  when the item is `planned`. It opens the project's Zekoder workspace and starts an agent on the
  **coding** binding (provider, model, effort and access mode from the saved agent defaults; any
  unset field uses the provider's own default). The first prompt is `/zekoder-implement {id}`
  (`$zekoder-implement {id}` on Codex), then the UI jumps to that agent. The server re-checks the
  status first, so a stale panel can't start a second run. A **Copy command** button next to it
  copies `/zekoder-implement {id}` for running by hand; it works for every status.
- **Promote**: a button in the detail panel of an idea. It is enabled only when the idea is
  `captured`. It starts an agent on the **planning** binding whose first prompt is
  `/zekoder-promote {id}` (`$` on Codex), then jumps to that agent, which asks whether to make a
  feature, followup or decision. The server re-checks the status first.
- **Migrate**: starts an agent with `/zekoder-migrate` on the **planning** provider and mode, using
  the `zekoder-migrate-agent` role's model and effort (an unset or `inherit` field uses the
  planning tab's). Every field is soft here: a model (or family), effort or mode that cannot be used, or a resolver that is missing
  or too old, falls back to the provider default, so a drifted workspace can still migrate.
- **No provider set**: when a bundle that supports agent defaults has no provider for the tab, the
  launch does not start an agent. If the bundle can write the machine tier, the button opens a
  provider picker ("No <tab> provider is set yet. Pick one to continue."); **Done** closes it and
  starts the launch again. Otherwise it shows "No <tab> provider is set yet. Set it in this
  project's Zekoder settings → <Planning|Coding> tab."
- **Soft and strict fields**: a model, effort or mode saved in the same or a higher tier than the
  provider is strict: if the provider does not offer it, the launch stops with an error naming the
  tier. A field from a lower tier is soft: if missing, it is dropped and the provider default is
  used.
- **Model families**: a model default can be a family name instead of an exact ID: Claude `opus`,
  `sonnet`, `haiku`, `fable`; Codex `sol`, `astra`, `luna`, `terra`. The name is stored as given and
  shown as "newest at launch". At launch the plugin asks the zekoder-skills resolver
  (`.zekoder-execution-profiles/materialize-execution-profile.mjs --resolve-model <provider> <family>`)
  for the native ID; it never picks a version itself and never writes the resolved ID back. If the
  resolver is missing or too old, the launch fails at any tier with `Model <value> (from <source>):
Needs a newer zekoder-skills (no --resolve-model).` If the resolver ran but gave no usable match,
  a soft field falls back to the provider default and a strict field fails, naming value, source and
  reason. Effort is checked on the resolved model. For `claude` sessions, a family in a role default
  is resolved the same way before the role-default variant is written. On Migrate, a resolver
  failure never stops the launch; it falls back to the provider default.
- **Older zekoder-mcp bundles** (no agent defaults): Implement and Promote start `claude` on the
  provider's default model. There is no supervisor model pin and no snapshot special case.
- **Role-default agents**: for `claude` sessions only, before the agent starts, the server writes
  the `claude` Role-default variant (`.claude/agents/<role>--role-default-<hash>.md`) of every
  built-in agent role that has a saved model or effort, so the new session loads them at start
  instead of stopping with "Agent type not found". Other providers skip this; zekoder-skills
  applies their roles at spawn. When a workspace is archived and no other open workspace shares its
  directory, those variant files are deleted (regular files only); a later run writes them again.
  Canonical agents and feature-017 profile variants are never touched.

The **Reports** page is a single Coding Health page. It shows the `/zekoder-org-health` report
for an org and window you pick with chips: the orgs come from the central store (plus the saved
org), and the window is Last day / 7 / 30 / 60 / 90 days (plus the saved value). The choice is saved as the
Reports settings. The page has the same filters as the web report (From / To calendar pickers, repository,
contributor, Include bots, Reset), totals, four native charts (commits per day, lines added and
deleted per day, top contributors by commits, closed PRs per repository), then sortable
per-contributor and per-repository tables. Tapping a table row filters by it. Filters are not saved.

The daemon runs `zekoder-org-health report --org <org> --days <n>` — cache only, no GitHub
requests — against the central store at `~/.zekoder-mcp/org_health/` (or `$ZEKODER_MCP_HOME/org_health/`),
which rewrites `<org>.json` and `<org>.html` there, then reads the JSON. If agents run with
`ZEKODER_MCP_HOME` set, the same value must be in the Zekoder daemon's environment; otherwise agents
and Zekoder read different stores. The CLI comes from `ZEKODER_ORG_HEALTH_BUNDLE`, else the zekoder-skills cache (`mcp/dist/zekoder-org-health-mcp.mjs`). A bundle older than zekoder 0.34.0 is refused with
"update the zekoder package to ≥ 0.34.0". If the central store has no data at all for the org, the
daemon first starts a background `zekoder-org-health collect` (GitHub requests via the host's `gh`
login) and the page polls every 5 s until it finishes; a failed collect is shown once, and Reload
retries it. For an org already in the store, if the cache doesn't cover the whole window, the page
shows a **Fetch missing days** button that runs the same background collect (cached days are
skipped) and polls until it finishes.

**Open report** starts a small local report service (`127.0.0.1`, first free port in 47823–47832,
random per-run token) and opens the full HTML report in the system browser. The page sends a
heartbeat every 30 s; the service shuts itself down after 5 minutes without a request, and when
the plugin is disposed.

The **Zekoder** page has two tabs, **Reports** and **Version**:

The plugin owns zekoder installs and updates. As long as it is installed, nobody runs the
installer by hand, in any project:

- **Latest version**: the daemon reads the release manifest
  (`https://storage.googleapis.com/zekoder-releases/releases/manifest.json`, or
  `ZEKODER_RELEASE_MANIFEST`) 10 s after start, then every 6 hours (or on **Check now**). It picks
  `channels.<channel>.latest`. The channel is a setting on the **Version** tab: `stable` (default)
  or `dev`. While stable has no release, `stable` uses the latest dev release, and the tab says
  so. `dev` never falls back. Changing the channel checks again at once. Switching from `dev` to
  `stable` never downgrades a newer install.
- **Cache**: an install downloads the release zip, checks its `sha256` from the manifest, unpacks
  it next to the zekoder-skills cache (`~/.cache/zekoder-skills`, or `ZEKODER_CACHE_DIR`;
  `SKILLS_CACHE_DIR` is a deprecated fallback), then swaps it in. `.zekoder-release.json` in the
  cache names the unpacked build, so an unchanged release is not downloaded again. An old git
  clone at that path is replaced. The daemon needs `node` on its `PATH` (no `unzip`: the
  zip is unpacked in-process). Only the older `install.sh` also needs `jq`.
- **Install targets**: every Zekoder project root, plus every open workspace directory that is not
  its project root (git worktrees — all installed files are gitignored, so each worktree needs its
  own install). Your home directory and `/` are skipped. A project does not need `.zekoder/` first.
- **Auto install / update**: a target is installed when its `.zekoder/config.json` →
  `packages.zekoder.version` is missing or behind the latest version. This runs after every
  check, on every status poll, when a workspace is created, and before an agent is created. Each
  install runs `node scripts/install.mjs <dir>` (older releases: `bash scripts/install.sh <dir>`) from the cache in the background. Runs go one at a time,
  because an install may replace the shared cache. A failed run is retried after one check interval, or
  at once with **Retry**. When a run succeeds, the plugin restarts its own zekoder-mcp process for
  that directory.
- **New agents**: if an agent starts in a project root or workspace directory with no zekoder at
  all, its start waits (up to 2 min) for the install, so the session loads the skills and MCP
  server. An outdated install is updated in the background instead. Agents that were already
  running still need `/mcp reconnect zekoder` and `/zekoder-migrate`, as usual.
- The installer edits each project's `.gitignore` (adds its own entries); that change shows up in
  git status the first time.
- A dot on the **Version** tab means some install failed. Expand a row to see its log.
- **Plugin card**: the top of the **Version** tab shows this plugin's own version and where it
  runs from (`Bundled`, `Downloaded` or `Unknown`). The desktop app updates the plugin; the host
  reports its state through `paseo.pluginUpdates.status("zekoder")`. When the host does not
  report it (plain Zekoder, older desktop app) the card says so and shows the installed copy.
  When updates are off the card says "Updates are managed by the desktop app". The card
  also shows the channel (set in the desktop app, display only), bundled and latest versions, the
  last check, a fallback reason and the last error. When the next daemon start runs a different
  version, it says "Restart the daemon to apply (Settings → Host → Restart daemon)". The plugin
  never restarts anything and has no restart button.

**Zekoder settings** is a workspace tab (workspace "+" menu). It is pinned to the workspace's own project, so there is no project picker and the project is never persisted. It splits the settings into four tabs: **Basic**
(default branch, merge), **Planning** (planning settings plus the planning session defaults and
model defaults for the planner, reviewer, discovery and quick-capture roles), **Coding** (simplify plus the coding
session defaults and model defaults for the supervisor, coding and simplify roles) and **Prompts** (custom prompt).
It edits a project's `.zekoder/config.json` `workflow` settings (merge mode, worktree
cleanup, branch deletion, default branch, planning tier, reviewer policy, max packages per feature, simplify mode
and its smart-mode thresholds, custom prompt), via
`zekoder_get_config`/`zekoder_set_config`. Each control saves on change (radios
immediately, text/number fields on blur) and re-reads the resolved config back from
zekoder-mcp, so fields left unset show the fallback value zekoder-mcp is actually using.

**Agent defaults** (features 020/021): the Planning and Coding tabs each edit the session's provider, model,
effort and access mode, plus native model/effort per provider and built-in role. Values resolve through
tiers: execution profile > repo > machine; a field unset in every tier means the provider's (or the
agent's) own default, because the plugin ships no factory values. Each set value shows its source
(`<value> · repo`, or `profile (<name>)`), and a **Reset** chip clears the repo's own value so the next
tier shows through. Dropdowns are fed live from Zekoder's ready providers (models, thinking levels,
access modes); if a provider can't list models, role rows fall back to free-text entry. Changing the
provider clears the repo's model, effort and mode for that tab in the same patch. Every save is one
`zekoder_set_config` call with `scope: "repo"` and an `agentDefaults` patch (never a file write), then the
panel re-reads `zekoder_get_config`. On a zekoder-mcp bundle older than 0.47 the controls are disabled
with "Needs a newer zekoder-mcp". Server validation errors show inline.
**Machine defaults** (Zekoder page, **Defaults** tab): the machine tier of the same defaults, applied
to every repo unless the repo or its execution profile sets the field. It is written through the
zekoder-mcp of one Zekoder project (named in the footer), never by a file write. On a bundle without
machine-scope support the controls are disabled with "Needs a newer zekoder-mcp". While the machine
planning or coding provider is unset, a **Set up providers** banner on the page opens this tab.
**Telemetry** (Zekoder page, **Telemetry** tab): opt this machine in or out of anonymous usage telemetry. It
calls `zekoder_telemetry` (`status`, `grant`, `decline`) through the zekoder-mcp of one Zekoder project. The choice
applies to every repo; there is no per-repo setting.

The **Default branch** field sets `workflow.defaultBranch` (where future plans and batches land);
Clear returns it to auto-detect (origin/HEAD, then main/master). It saves only on Save/Clear, and an
invalid branch name shows zekoder-mcp's `validation-failed` message inline with nothing written.
It never touches `projects[]` or `supportedHarnessAgents` — those stay config-file-only for now.

**Git** is a right-panel tab (`locations: ["explorer"]`) for the workspace's own checkout
(`directory`, not the project root). It shows three collapsible tree sections, GitLens-style, split by thin rules:

- **Worktrees**: every `git worktree list` entry — branch (or detached sha), folder name, and
  main/locked/prunable flags. The current workspace's worktree is highlighted.
- **Branches**: **Local** (with ↑ahead ↓behind vs upstream) and **Remote** (collapsed by default),
  newest commit first. The checked-out branch is highlighted.
- **History**: a vertical lane graph of `git log --topo-order` — dots, fork and merge links, and
  ref pills — 100 commits at a time with **Load more**. The header toggle switches between the
  current branch and all local branches. Tap a commit for its full sha, author and date.

It works in any git project (no `.zekoder/` needed), refreshes every 15 s, and is read-only. The
server accepts the directory only when it shares a git common dir with a known Zekoder project.

**Reports** sets the report parameters, stored as Zekoder host settings (`zekoder-report-settings`):
the GitHub **org** and **days back** (1–365, default 60). On **Save**, the daemon runs
`gh api orgs/<org>`; the org is saved (as its canonical login) only if it exists and the daemon's
`gh` login can access it.

**Branch pill**: every agent whose working directory is inside a project with a `.zekoder/`
workspace gets a composer pill showing the git branch it is on (`detached @ <sha>` for a detached
HEAD). Agents elsewhere get no pill. The branch is re-read when the agent updates (at most every
5 s) or when you press the pill. Pressing it also opens the **Git** tab in the right panel.

This is not a skill package. It is the built-in `zekoder` plugin and lives in this repo at `plugins/zekoder/`, and the zekoder installer (`cyberneticlabs/zekoder-skills`) does not install it. Desktop-launched daemons also pick up newer signed releases (see `docs/plugins.md`).

## How it reads data

The plugin never parses `.zekoder/` itself. Its daemon side (`server/`) starts the project's own
**zekoder-mcp** server over stdio and calls its read tools (`zekoder_list_items`, `zekoder_search`, `zekoder_get_item`)
with `cwd` set to the project root. The UI therefore sees exactly what the agents see.

The server command comes from, in order:

1. the project's `.mcp.json` → `mcpServers.zekoder` (written by the `cyberneticlabs/zekoder-skills` installer)
2. `ZEKODER_MCP_BUNDLE` env var on the Zekoder daemon (a path to `zekoder-mcp.mjs`)
3. `${ZEKODER_CACHE_DIR:-~/.cache/zekoder-skills}/mcp/dist/zekoder-mcp.mjs` (the plugin-managed cache of the zekoder-skills release zip; the bundle is built in `cyberneticlabs/zekoder-mcp`)

The plugin keeps one MCP process per project and stops it after 10 idle minutes. Only Zekoder
projects whose root contains `.zekoder/` are listed.

## Layout

```
paseo-plugin.json      manifest (id: zekoder)
index.client.tsx       sidebar items + surfaces + Command Center entries
index.server.ts        RPC handlers, lifecycle hooks, scheduled version check
shared/issues.ts       issue RPC contracts (zod) shared by client and server
shared/version.ts      version/update RPC contracts
shared/plugin-version.ts  PLUGIN_VERSION, this plugin's own version (release tag)
shared/config.ts       workflow-config and role-default RPC contracts
shared/telemetry.ts    machine telemetry-consent RPC contracts
shared/branch.ts       agent-branch RPC contract (composer pill)
shared/git.ts          git-overview RPC contract (Git right-panel tab)
shared/reports.ts      report settings, org validation + coding-health RPC contracts
server/zekoder.ts      project discovery, filter mapping, MCP process pool
server/version.ts      release-manifest check, automatic installer runs/updates (queue + hooks)
server/config.ts       zekoder_get_config/zekoder_set_config + harness model-list and provider-list RPC handlers
server/telemetry.ts    zekoder_telemetry status/grant/decline handlers
server/branch.ts        branch lookup for an agent cwd (git rev-parse)
server/git.ts          worktrees, branches, log + graph lane layout for the Git tab
server/reports.ts      gh org check, coding-health/list-orgs/open-report handlers
server/org-health-cli.ts  zekoder-org-health CLI runner + version guard
server/report-server.ts   local report web service (token, heartbeat, idle shutdown)
server/mcp-client.ts   minimal dependency-free MCP stdio client
client/                composer branch pill (agent-branch-pills.ts) + React Native UI (issues, reports and zekoder surfaces, tab bar, agent-defaults editor, machine-defaults panel, provider onboarding, coding-health
                       page, health charts + aggregation, version/config/report-settings panels, chip, dropdown, row, button, detail panel,
                       doc viewer, Git panel + its per-workspace header button in git-tab.ts)
```

To add a feature: define its RPC in `shared/`, handle it in `server/`, register it in
`index.server.ts`, then add UI under `client/` and register it in `index.client.tsx`.

## Develop

The plugin is a built-in: edit it in place under `plugins/zekoder/`. It has no dependencies of its
own; every import is a host module. Type checking runs from the repo root with `npm run typecheck`.
Restart the dev daemon after a change, because built-ins load at daemon start.

`package.json` `version` is the only version of the plugin, and `shared/plugin-version.ts` must
equal it. The checksum that identifies a version covers the `files` allowlist only, so this README
and `package.json` do not change it (`scripts/zekoder-plugin-tree.mjs`). See `docs/plugins.md` for
the built-in model and `docs/release.md` for releasing.
