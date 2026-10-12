---
id: 006-host-zekoder-provisioning
type: feature
title: Detect hosts missing Zekoder and one-click provision
status: planned
createdAt: 2026-10-12
openedAt: 2026-10-12T12:19:56.885Z
updatedAt: 2026-10-12T12:27:35.295Z
branch: feature-006-host-zekoder-provisioning
promoted: false
dependsOn: []
packages: []
contracts: []
relatedFeatures:
  - 001-builtin-zekoder-plugin
  - 004-plugin-auto-update
  - 005-dev-zekoder-plugin-path-override
relatedBugs: []
relatedFollowups: []
statusHistory: []
---
# Feature 006-host-zekoder-provisioning: Detect hosts missing Zekoder and one-click provision

> **Light-tier plan.** One area (`packages/app`), one branch (`feature-006-host-zekoder-provisioning`), one document.

## User's request (verbatim)

"go with option 3, plan it". Option 3: "Real fix in the app: check the plugin catalog of each connected host. If `zekoder` is missing, show 'This host lacks Zekoder' with a one-click install. Longer term, publish the fork's daemon under its own package name." Original complaint: "a new zekoder app in a new server in agentshome, the repo has .zekoder but not the skills and of course no cache, zekoder is supposed to detect that, build the cache, install the skills and fetch the mcp .. why all of these things not done?"

Cause (verified on host `agentshome`): it runs stock upstream `@getpaseo/cli@0.11.2`, whose built-ins exclude `zekoder`; `pluginsEnabled` is unset. The fork ships `zekoder` only as a built-in of the desktop app's local daemon. Meanwhile the local daemon's Issues/Reports/Zekoder rows stay visible while agentshome is active and silently open the **local** host's Zekoder. Cause: `selectPluginSidebarTarget` (`plugins/sidebar-groups.ts`) falls back to the remembered host, then the first host.

## Refined scope

- **Active host** = route host (`hostIdFromPathname(usePathname())`, `plugins/routes.ts`) when set, else `useActiveWorkspaceSelection()?.serverId`. Every Zekoder surface in this feature uses it.
- **Status** of the active host: `unknown` (offline, loading, no `plugins` feature, or configured but `status: "failed"` with no `error` yet, i.e. still starting), `present` (`zekoder` in the daemon catalog), `unsupported` (no `pluginSourceInstallation`), `install` (not configured), `enable-plugin` (configured, `enabled: false`), `enable-plugins` (configured and enabled, `pluginsEnabled !== true`), `failed` (`listPlugins()` item `status: "failed"` with `error`).
- **Rows follow the active host** (user decision). Zekoder sidebar rows always open the active host's Zekoder. When that host lacks it, the same rows open the install empty state for that host. This applies to Zekoder only. Fallback behavior for other plugins is unchanged.
- **No duplicates.** App placeholder rows appear only when no connected host contributes Zekoder rows (no `zekoder` group in `useSidebarNavItems("header").items`, hidden ones included) and the active-host status is not `present`/`unknown`.
- **Banner**: a dismissible sidebar callout with Install / Turn on for `install`/`enable-*`. Web/desktop only, because `components/sidebar-callout-slot.native.tsx` renders null. Mobile relies on the rows and the empty state.
- **Consent**: one `confirmDialog` with trust copy. It says Zekoder is trusted, unsandboxed code running with the daemon user's access on that host, and that its client contributions run in this app. Confirming installs/enables Zekoder **and** turns on plugins for the host when they are off. One confirm does both. Never write `pluginsEnabled` without it.
- **Source**: `npm:@cyberneticlabs/paseo-zekoder@<exact version>`, id `zekoder`, version locked to `plugins/zekoder.lock.json` (`0.11.1`). Errors surface the host's message in a toast. Cross-platform; no protocol or server change.

## Out of scope

Publishing the npm package (prerequisite below); a fork-owned daemon package; bugs inside vendored `plugins/zekoder`; a Plugins-page callout; edits under `plugins/zekoder/`; refactoring `plugins-page.tsx` (it has no reusable install hook. Call the same client methods instead); changing `selectPluginSidebarTarget` for other plugins.

## Approach

Fork code lives in the new owned module `packages/app/src/zekoder/`. Upstream gets four one-line hooks: a mount in `app/_layout.tsx`, a branch in `plugins/sidebar-items/index.tsx`, a render in `components/sidebar/sidebar-nav-rows.tsx`, and a fallback branch in `plugins/surface-screen.tsx`.

- **Presence**: query the daemon directly. `PluginCatalogSync` clears a host from `pluginRegistry` when no voice audio engine exists (`plugins/catalog-sync.tsx:23`), so the registry can falsely report Zekoder missing. Use one shared `useFetchQuery` (`@/data/query`) with key `["zekoder-host", serverId]` that returns `Promise.all([client.getPluginCatalog(), client.listPlugins()])`. Every consumer uses this key so React Query dedupes them. The `status.plugin_catalog_changed` subscription (`client.observeEvents`, as `catalog-sync.tsx`) lives once, in the root source component (task 3), and invalidates the key. `pluginsEnabled` comes from `useDaemonConfig(serverId)`, which is already a shared query.
- **Actions** (same client calls as `plugins-page.tsx:358/393`): `install` → `client.installPluginSource({source, id: "zekoder"})`; `enable-plugin` → `client.enablePlugin("zekoder")`. Then, only if `config.pluginsEnabled !== true`, `patchConfig({pluginsEnabled: true})`. The server installs while plugins are off (`server/plugins/index.ts` `installSource`) and the global switch starts it, so a failed install never enables plugins.
- **Pin**: a constant, not a JSON import (Metro importing outside `packages/app` is unverified). A test reads the lock with `fs`, so the lock stays the single source of truth.
- **Row override**: in `PluginSidebarItem` (`plugins/sidebar-items/index.tsx:73`), route `legacy` groups with `pluginId === ZEKODER_PLUGIN_ID` to `ZekoderSidebarRow`. It targets the active host via `buildPluginSurfaceRoute(activeHost, "zekoder", {kind: "sidebar", id})`. With no active host it renders `LegacyPluginSidebarRow` unchanged. The same component draws placeholders from `ZEKODER_PLACEHOLDER_ITEMS`, which mirror `plugins/zekoder/index.client.tsx:38-40`: `issues` "Issues" `ListTodo`, `reports` "Reports" `Activity`, `zekoder` "Zekoder" `Settings`. Use `SidebarHeaderRow` + `resolvePluginIcon` as in `plugins/sidebar-items/legacy.tsx`. Placeholders are never registered in `pluginRegistry` or the `plugin:` preference keys.
- `SidebarNavRows` returns null when the user hides every nav item. Accepted: placeholders hide too.

## Related work considered

- Features `004-plugin-auto-update` and `005-dev-zekoder-plugin-path-override` (planned) touch the built-in plugin, not app-side remote provisioning: related, separate. `001-builtin-zekoder-plugin` (merged) is context.
- Open bugs/followups (`004`/`005` bugs, `002`/`005` followups) do not overlap: none to fold in. Decisions: none relevant.

## Tasks

- [ ] 1. `packages/app/src/zekoder/host-provisioning.ts`: `ZEKODER_PLUGIN_ID`, `ZEKODER_NPM_PACKAGE = "@cyberneticlabs/paseo-zekoder"` (the one place to change the name), `ZEKODER_PLUGIN_VERSION = "0.11.1"`, `ZEKODER_PLUGIN_SOURCE`, `ZEKODER_PLACEHOLDER_ITEMS`. Also pure functions `resolveHostZekoderStatus(input)`, `resolveZekoderActiveHost(routeHostId, workspaceHostId)` and `shouldShowZekoderPlaceholders(hasZekoderGroup, status)`. Add `host-provisioning.test.ts` covering every status (including failed-without-error → `unknown`), host precedence and placeholder gating. It also asserts that `ZEKODER_PLUGIN_VERSION` equals `version` in the repo-root `plugins/zekoder.lock.json` (read via `node:fs`) and is exact semver.
- [ ] 2. `packages/app/src/zekoder/use-host-zekoder.ts`: `useZekoderActiveHost()` and `useHostZekoder(serverId)` → `{status, provision, isProvisioning}`, implemented per Approach. Tag the `pluginSourceInstallation` gate `// COMPAT(pluginSourceInstallation)` as `plugins-page.tsx:273` does. `provision` awaits the consent `confirmDialog` (`utils/confirm-dialog.ts`). The copy varies by status and mentions turning on plugins only when `pluginsEnabled !== true`. Errors go to `useToast()` (`contexts/toast-api-context.tsx`). Add `use-host-zekoder.test.tsx`, mocking like `screens/settings/plugins-page.test.tsx`: declined → no client calls; confirmed with plugins off → `installPluginSource` then `patchConfig`; install rejects → no `patchConfig`, error toast.
- [ ] 3. `packages/app/src/zekoder/zekoder-host-source.tsx`: mounted once next to `<WorktreeSetupCalloutSource />` in `app/_layout.tsx` (~L601). It owns the catalog-change subscription and invalidation for the active host. It shows the callout via `useSidebarCallouts().show` (pattern: `components/worktree-setup-callout-source.tsx`) for `install`/`enable-*` statuses, with `dismissalKey` `zekoder-host-missing:<serverId>`, and unregisters when the status changes.
- [ ] 4. `packages/app/src/zekoder/zekoder-sidebar-row.tsx`: `ZekoderSidebarRow` (override and placeholder, testIDs unchanged for real rows, `zekoder-placeholder-<id>` for placeholders) and `ZekoderPlaceholderRows`. Hooks: the `PluginSidebarItem` branch from Approach, and `<ZekoderPlaceholderRows onBeforeNavigate={onBeforeNavigate} />` after the mapped items in `SidebarNavRows`.
- [ ] 5. `packages/app/src/zekoder/zekoder-missing-state.tsx` + `plugins/surface-screen.tsx` fallback (~L235): when `pluginId === ZEKODER_PLUGIN_ID && !plugin`, render `<ZekoderMissingState serverId={serverId} />`. It shows "this host lacks Zekoder" with the provision button for `install`/`enable-*`, update-host copy for `unsupported`, the host's `error` plus a button to `buildSettingsHostSectionRoute(serverId, "plugins")` for `failed`, and the existing fallback text for `present`/`unknown`. Follow docs/design.md, docs/unistyles.md (no `useUnistyles()`) and docs/hover.md.
- [ ] 6. i18n: `zekoder.hostProvisioning.*` keys (callout, consent variants, actions, empty states, errors) in `packages/app/src/i18n/resources/en.ts` and every locale file, so the `resources.test.ts` parity check passes.
- [ ] 7. `docs/plugins.md` "Built-in plugins": 3-4 lines saying remote upstream daemons lack the `zekoder` built-in; the app offers a pinned npm install; Zekoder sidebar rows follow the active host; the pin lives in `packages/app/src/zekoder/host-provisioning.ts` and is test-locked to `plugins/zekoder.lock.json`. Bump order: publish `@cyberneticlabs/paseo-zekoder@<new>` to npm first, then bump the lock (sync script) and the constant together.

## Verification

- `npm run typecheck`; `npm run lint -- <changed files>`; `npm run format:files -- <changed files>`.
- `npx vitest run <file> --bail=1 > /tmp/test-output.txt 2>&1` for `packages/app/src/zekoder/host-provisioning.test.ts`, `packages/app/src/zekoder/use-host-zekoder.test.tsx` and `packages/app/src/i18n/resources.test.ts`. Never the full suite.
- Manual (never port 6767). Run the desktop dev app on its local daemon with Zekoder built in (`npm run dev:desktop`), then add a second dev daemon started with `PASEO_DISABLE_BUILTIN_PLUGINS=zekoder` on a free port and `PASEO_HOME` and make it the active host. Expected:
  - Exactly one Issues/Reports/Zekoder row set, with no duplicates.
  - The rows open the install empty state for the second host, never the local host's surfaces.
  - The banner shows.
  - Cancel changes nothing.
  - Confirm with the package unpublished toasts the host's install error and leaves `pluginsEnabled` unchanged.
  - Switching back to the local host makes the rows open the real Zekoder surfaces and hides the banner.
- End-to-end install (Issues/Reports load after confirm) waits on the npm publish prerequisite.

## Prerequisite (external, not a task here)

Publish `@cyberneticlabs/paseo-zekoder@0.11.1` publicly to npm from `cyberneticlabs/zekoder-plugins`. Its `paseo/package.json` is `paseo-zekoder`, `"private": true`, with no `publishConfig`. The package must install as a Paseo plugin from an npm source: `paseo-plugin.json` with id `zekoder`, plus a built client bundle. If the published name differs, change only `ZEKODER_NPM_PACKAGE`.
