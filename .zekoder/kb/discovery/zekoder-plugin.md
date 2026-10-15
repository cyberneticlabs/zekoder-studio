<!-- discovery-stamp: sha=21a4ebe7010933b63f524384370d96d6c4be4f58 globs=["plugins/zekoder/**","packages/server/src/server/plugins/**","packages/server/package.json","vitest.config.ts"] updatedAt=2026-10-15T17:00:00Z -->
# Discovery: Zekoder plugin source (`plugins/zekoder/`)

The plugin is the repo's built-in `zekoder` plugin: a Paseo plugin (npm name `paseo-zekoder`, TypeScript, React Native + react-query) that gives Zekoder projects an Issues page, Reports, a machine settings page, per-project settings and a Git right-panel tab. Registry, packaging, updater and release pipeline: kb/discovery/plugins.md. Developer guide: docs/zekoder-plugin.md.

## Layout

- `paseo-plugin.json` manifest; `index.client.tsx` client entry (surfaces `issues`/`reports`/`zekoder`, sidebar items, workspace panels, header button, Command Center items); `index.server.ts` server entry (`server.handle(rpc, fn)` per RPC, lifecycle hooks, scheduled version check).
- `shared/` zod RPC contracts used by both sides (`defineRpc`): `config.ts`, `issues.ts`, `reports.ts`, `git.ts`, `branch.ts`, `version.ts`, `telemetry.ts`, `errors.ts`, `plugin-version.ts`.
- `server/` runs in the daemon: `mcp-client.ts` (dependency-free MCP stdio client), `zekoder.ts` (project assertion, MCP dispatch, launch), `config.ts`, `version.ts`, `unzip.ts`, `reports.ts` + `report-server.ts` + `org-health-cli.ts` (Coding Health), `git.ts` + `branch.ts` (Git panel), `role-variants.ts`, `telemetry.ts`.
- `client/` React Native UI. Surfaces: `zekoder-surface.tsx`, `issues-tab.tsx`, `reports-surface.tsx`, `coding-health-tab.tsx`, `git-panel.tsx`, `git-tab.ts`, `config-panel.tsx`, `version-panel.tsx`, `machine-defaults-panel.tsx`. Primitives: `button`, `chip`, `dropdown`, `tab-bar`, `date-picker`, `styles.ts`. Reuse before adding.
- `README.md` is user-facing behavior; update it with behavior changes. Outside the `files` allowlist, as is `package.json`.

## Conventions

- Data flow: client -> plugin RPC (schemas in `shared/`) -> `server/` -> stdio -> zekoder-mcp bundle -> `.zekoder/` of the selected project. The client never calls MCP directly. Define the RPC schema in `shared/<area>.ts` first, then the server handler, then the UI.
- File names kebab-case; `.tsx` only for JSX. The plugin has no dependencies of its own: every import is a host module (docs/plugins.md "Built-in plugins"), so a new npm import breaks packaged desktops.
- `package.json` `files` is exactly what a release ships (manifest, entries, `client/`, `server/`, `shared/`). A new top-level directory must be added there.
- Version: `package.json` `version` equals `shared/plugin-version.ts` `PLUGIN_VERSION`. Bump on a user-visible change.
- Typecheck is the root `plugins/tsconfig.json` (`npm run typecheck:server`); no plugin-local tsconfig. oxlint covers plugins/zekoder (followup 008-lint-zekoder-plugin-source is resolved).
- The server re-validates every root with `assertZekoderProject`; a client root is a hint. Never persist a locked root.
- Labels are inline (no i18n). Plugin code cannot call daemon `client.reloadPlugin`, and the public `PaseoApi` has no filesystem API.

## zekoder-mcp bundle

- The plugin never imports zekoder-mcp source (cyberneticlabs/zekoder-mcp); it spawns the bundle over stdio.
- Lookup order (`server/zekoder.ts` ~L608-630): the project's `.mcp.json` `mcpServers.zekoder`, then `ZEKODER_MCP_BUNDLE`, then `${ZEKODER_CACHE_DIR:-~/.cache/zekoder-skills}/mcp/dist/zekoder-mcp.mjs`.
- The plugin owns the zekoder install/update: `server/version.ts` reads the zekoder-skills release manifest (channel `stable`|`dev`, stable falls back to dev), sha256-checks the zip into the cache, extracts it in process with `unzip.ts` (stored/deflate, zip-slip and CRC checks, no `unzip` binary), then runs `scripts/install.mjs` (older releases `install.sh`) in every Zekoder project and worktree.
- `unzip.ts` is unsuitable for user project archives: unrestricted mkdir/writeFile/chmod, unbounded inflate.

## Agent defaults and launch

- Config shape: `shared/config.ts` `AGENT_TABS` = planning (Promote, Migrate) / coding (Implement); `AGENT_SOURCES` = profile > repo > machine, no factory tier. `isStrictField(fieldSource, providerSource)`: a field from the same or a higher tier than the provider is strict. Needs zekoder-mcp 0.47.0+; older bundles degrade (Implement/Promote start `claude` on its default model).
- `server/zekoder.ts` `fetchConfig` copies known keys from `zekoder_get_config`; `toAgentDefaultsState` maps them; support = `sources.agentDefaults`, machine scope = the machine-scope capability flag. `server/config.ts` `toSetConfigArgs` maps editor patches to `zekoder_set_config`.
- Machine tier (`zekoder.defaults.get|set`): uses a project transport when available and machine-only MCP transport without a project (server/config.ts and server/zekoder.ts). Never write `~/.zekoder-mcp/config.json` directly.
- Launch: `startAgent(paseo, root, title, skill, arg, tab, fieldsFromTab)` does one `fetchConfig`, then `resolveLaunch`: unset provider on an unsupported bundle -> `claude`; on a supported one -> `needs-onboarding`. Strict miss throws naming the tier; soft miss falls back to the provider default. Migrate passes `fieldsFromTab: false`. `skillPrompt` uses `$skill` on codex, `/skill` otherwise.
- Claude only: `role-variants.ts` pre-writes `.claude/agents/<role>--role-default-<hash>.md` (effort-only -> model `inherit`); cleaned on `workspace.archived`.
- Issues: `server/zekoder.ts` maps Open/Done/All to MCP status filters (`OPEN_STATUS_FILTER`, includes decision `proposed`); list limit 500, search 50. `implementIssue` re-reads status first (stale-UI guard). `issueSchema.type` is a string, but input schemas restrict to `ITEM_TYPES`, so a type missing there lists but cannot open.
- Clipboard: `copyText` from `@getpaseo/plugin/client/react-native`, not `navigator.clipboard`.

## Panels and project scope

- Where a panel lives: sidebar item + `addSurface` is global (no workspace); `addWorkspacePanel` gets `workspaceId`; `locations: ["explorer"]` targets the right panel. `projectRootPath` is the project root; `directory` is the worktree.
- `locations` only permits a location. Right-panel tabs default to Files and Changes; open ours with `openPanel(id, {location: "explorer"})`. Explorer may be hidden on compact layouts: register `["workspace","explorer"]` and pick at call time (`client/panel-location.ts`; docs/explorer-sidebar.md owns the sidebar).
- `assertZekoderProject` filters `.zekoder` projects; it is not generic project confinement.
- Panel/button ids match `/^[a-z][a-z0-9-]*$/`; workspace ids (`wks_...`) need sanitizing first.
- Docs: docs/zekoder-plugin.md.

## Machine files outside zekoder-mcp

- OMP `~/.omp/agent/models.yml` is a separate harness config, unlike the zekoder-mcp machine file. Its YAML editing needs comment-preserving Document nodes; do not borrow the installer directory-swap logic in server/version.ts as a config-file writer.
- yaml 2.9.1 is already a packages/server runtime dependency, but built-ins cannot import it today: compiler.ts SERVER_HOST_MODULES/import boundary and bundle-evaluator.ts runtime injection supply SDK+zod only. A server dependency alone does not make it resolvable outside Electron app.asar. Extending that host surface needs architecture approval.
- Root vitest.config.ts discovers plugin test.ts files (excluding .dev worktrees); plugins/tsconfig.json excludes those tests. Use existing root test discovery and CI jobs.
- OMP resolver implementation is not in this repo: do not infer env references from ALL-CAPS spelling or execute !command keys to classify them.
