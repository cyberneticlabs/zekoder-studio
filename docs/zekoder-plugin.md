# Zekoder plugin

How to change the built-in Zekoder plugin in `plugins/zekoder/`. The built-in model, the updater and
the version and checksum rules are in [plugins.md](plugins.md#the-zekoder-plugin). Releasing is in
[release.md](release.md#zekoder-plugin-releases). User-facing behavior is in
`plugins/zekoder/README.md`; update it with every behavior change.

## Edit loop

1. Edit under `plugins/zekoder/`. The plugin has no dependencies of its own: every import must be a
   host module, or the packaged desktop cannot resolve it (see
   [Built-in plugins](plugins.md#built-in-plugins)).
2. Run `npm run typecheck`. One `plugins/tsconfig.json` covers all plugin directories; do not add a
   tsconfig inside `plugins/zekoder/`.
3. Restart the dev daemon. Built-ins load at daemon start, and `paseo plugin reload` rejects
   built-in ids.
4. Reload the app window. The app keeps the client bundle it loaded until the window reloads, even
   when the daemon log shows the new RPCs.

oxlint does not cover the directory yet (followup `008-lint-zekoder-plugin-source`); oxfmt and knip do.

Add a feature in this order: the RPC contract in `shared/` (zod, `defineRpc`), the handler in
`server/` registered in `index.server.ts`, then the UI in `client/` registered in
`index.client.tsx`. The client never calls zekoder-mcp directly. A new top-level directory goes into
the `files` list of `plugins/zekoder/package.json`, or a release leaves it out.

## The zekoder-mcp bundle

The plugin never imports zekoder-mcp source (`cyberneticlabs/zekoder-mcp`). It starts the bundle
over stdio with `cwd` set to the project root, so the UI sees what the agents see. The command comes
from, in order:

1. The project's `.mcp.json` `mcpServers.zekoder`, written by the zekoder-skills installer.
2. `ZEKODER_MCP_BUNDLE`, a path to `zekoder-mcp.mjs`, set on the daemon.
3. `${ZEKODER_CACHE_DIR:-~/.cache/zekoder-skills}/mcp/dist/zekoder-mcp.mjs`.

The plugin owns installing and updating zekoder, so nobody runs the installer by hand. It reads the
zekoder-skills release manifest (channel `stable` or `dev`; `stable` falls back to `dev`), checks the
zip's `sha256` into the cache, unpacks it in process, then runs `scripts/install.mjs` (older
releases: `install.sh`) in every Zekoder project and worktree. Runs go one at a time because an
install can replace the shared cache. The plugin README documents the auto-install settings.

## Project scoping

Pick the extension point by scope:

| Goal                          | SDK call                                           | Props                    |
| ----------------------------- | -------------------------------------------------- | ------------------------ |
| Sidebar page, no workspace    | `addSidebarItem` + `addSurface`                    | none                     |
| Tab in the workspace "+" menu | `addWorkspacePanel` (`context: "workspace"`)       | `workspaceId`            |
| Tab in the right panel        | `addWorkspacePanel` with `locations: ["explorer"]` | `workspaceId`            |
| Panel tied to one agent       | `addWorkspacePanel` (`context: "agent"`)           | `workspaceId`, `agentId` |

- Resolve the project with `useWorkspace(workspaceId, (w) => w.projectRootPath)`. It returns
  `null` until the workspace loads. `projectRootPath` is the project root; `directory` is the
  worktree.
- Reuse the global page: give it an optional `lockedRoot`, hide the project picker when set, and
  never write it into persisted settings. Type shared components with `Pick<PluginSurfaceProps, ...>`
  so surface and panel props both fit.
- The client root is a hint. Every RPC re-validates it with `assertZekoderProject`, which filters
  `.zekoder` projects and is not general project confinement.

## Right-panel tabs

The right panel is the `"explorer"` location of `addWorkspacePanel`; there is no separate hook.
[explorer-sidebar.md](explorer-sidebar.md) owns the host, placement and routing contracts.

- `locations` only says where a panel may open. The right panel's default tabs are Files and
  Changes, so a plugin tab shows after something opens it: the panel's new-tab launcher, or
  `openPanel(id, { location: "explorer" })`. Ship a Command Center item or header button for that.
- A header button needs a `workspaceId`: track workspaces with `paseo.workspaces.list({ subscribe: {} })`
  and page through `pageInfo`, since the subscription reports changes only. Never call `openPanel`
  for every listed workspace; it navigates. To auto-open, do it from the button's icon component,
  and remember which workspaces you opened so a closed tab stays closed. `client/git-tab.ts` is the
  worked example.
- The explorer may not show on compact layouts. Register `["workspace", "explorer"]` and pick the
  location at call time (`client/panel-location.ts`); inside a panel use `props.layout.compact`.
- Panel and button ids match `/^[a-z][a-z0-9-]*$/`. Workspace ids contain `_`; sanitize them before
  building an id.
- Design for a narrow column: one-line rows with `numberOfLines={1}`, details in a click-through
  view or a surface, and colors from `props.theme`.
