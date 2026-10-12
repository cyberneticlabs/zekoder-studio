<!-- discovery-stamp: sha=53b816035922d8e867c41920aec5ee4350e76773 globs=["packages/app/src/plugins/**", "packages/app/src/screens/settings/plugins-page.tsx", "packages/app/src/screens/settings/plugin-install-form-model.ts", "packages/app/src/components/sidebar/**", "packages/app/src/sidebar-nav/**", "packages/app/src/components/sidebar-callout*.tsx", "packages/app/src/contexts/sidebar-callout-*.ts*", "packages/app/src/components/worktree-setup-callout-source.tsx", "packages/app/src/app/_layout.tsx", "packages/app/src/hooks/use-daemon-config.ts", "packages/app/src/runtime/host-features.ts", "packages/app/src/utils/confirm-dialog.ts", "packages/app/src/i18n/**", "packages/app/metro.config.cjs", "packages/client/src/daemon-client.ts", "packages/protocol/src/plugin-source-reference.ts", "packages/protocol/src/messages.ts", "packages/server/src/server/plugins/index.ts", "public-docs/plugins/reference.md"] updatedAt=2026-10-12T12:45:00Z -->

# Discovery: app-side per-host plugin UI

Server/registry/packaging side: kb/discovery/plugins.md.

## Presence of a plugin on a host

- `plugins/registry.ts` — `pluginRegistry` singleton; hooks `useInstalledPlugins()`, `useInstalledPlugin(serverId, pluginId)`, `usePluginInstallations(pluginId)`.
- `plugins/catalog-sync.tsx` `PluginCatalogSync` (mounted `app/_layout.tsx` ~L278) clears the host from the registry when `plugins` feature is off, the host is offline, OR no voice audio engine (`useVoiceAudioEngineOptional()` null). Registry absence is therefore not proof a plugin is missing; query `client.getPluginCatalog()` directly for presence.
- `client.getPluginCatalog()` = running plugins incl. built-ins. `client.listPlugins()` = configured entries only, built-in ids excluded (server `plugins/index.ts` ~L209), each `{id, enabled, status: running|disabled|failed, error?, installation}`. `status: "failed"` just means enabled+globally on but not running (also true while starting); `error` is set only after a recorded failure.
- Stock upstream daemons have no `zekoder` built-in; the fork's desktop daemon runs it as a built-in regardless of `pluginsEnabled`.

## Install / enable (client calls)

- `installPluginSource({source, id?, ref?})` (`daemon-client.ts` ~L5545) — throws unless `features.pluginSourceInstallation`; 5-min timeout. Source spec `npm:<@scope/name>@<exact>` (public-docs/plugins/reference.md ~L2283).
- Server `installSource` installs while `pluginsEnabled` is off (only start is gated, `canPublish`); flipping `pluginsEnabled` true starts configured plugins without restart. Rejects an already-configured id.
- `enablePlugin` / `disablePlugin` / `removePlugin` / `reloadPlugin` (`daemon-client.ts` ~L5639-5651).
- `useDaemonConfig(serverId)` (`hooks/use-daemon-config.ts`) → `{config, patchConfig}`; `patchConfig({pluginsEnabled})`.
- `useHostFeature(serverId, name)` (`runtime/host-features.ts`) — false until serverInfo arrives.
- `plugins-page.tsx` (`HostPluginsPage`): install/toggle/remove logic is inline (no reusable hook); `plugin-install-form-model.ts` is the reusable form model. No install consent dialog; trust copy is an inline Alert (`settings.plugins.trusted*`). Route: `buildSettingsHostSectionRoute(serverId, "plugins")` (`utils/host-routes.ts`).

## Sidebar

- `components/sidebar/sidebar-nav-rows.tsx` `SidebarNavRows` maps `useSidebarNavItems("header")` (`sidebar-nav/use-sidebar-nav-items.ts`); plugin rows via `PluginSidebarItem` (`plugins/sidebar-items/index.tsx`, legacy branch ~L73); built-in rows `BUILTIN_ROWS`. Returns null when every item is hidden. Preference keys `plugin:<pluginId>:<contributionId>` (`sidebar-nav/model.ts`).
- Cross-host merge: `groupPluginSidebarItems` (`plugins/sidebar-groups.ts`) makes ONE group per `pluginId/sidebar/<id>` across all connected hosts; `selectPluginSidebarTarget` picks route host, else remembered host, else first. So a row stays visible on a host that lacks the plugin and silently opens another host's plugin (the zekoder field bug; feature 006 overrides this for zekoder only).
- Legacy plugin row render: `plugins/sidebar-items/legacy.tsx` `LegacyPluginSidebarRow` (`SidebarHeaderRow` + `resolvePluginIcon`, route host from `hostIdFromPathname`).
- No app-owned registration into `pluginRegistry`; app-owned rows must render outside it with their own keys, or they merge into real plugin groups.

## Surface route

- `buildPluginSurfaceRoute(serverId, pluginId, {kind, id})` → `/h/{serverId}/plugin/{pluginId}/{sidebar|surface}/{id}` (`plugins/routes.ts`); screen `plugins/surface-screen.tsx` `PluginSurfaceScreen` renders the surface only if the plugin is installed on the route host, else fallback text (~L235). Its `PluginHostFilter` lists only hosts that contribute the item.
- Vendored zekoder client contributions (`plugins/zekoder/index.client.tsx:38-40`): sidebar `issues` ListTodo, `reports` Activity, `zekoder` Settings; same surface ids.

## Callouts, dialogs, toasts

- `useSidebarCallouts().show(options)` (`contexts/sidebar-callout-context.tsx`, options in `sidebar-callout-state.ts`: id, dismissalKey, title, description, variant, actions ≤2). Source pattern: `components/worktree-setup-callout-source.tsx`, mounted `app/_layout.tsx` ~L599-602.
- `components/sidebar-callout-slot.native.tsx` renders null: sidebar callouts are web/desktop only.
- `confirmDialog({title, message, confirmLabel, cancelLabel, destructive})` (`utils/confirm-dialog.ts`), cross-platform. `useToast()` (`contexts/toast-api-context.tsx`). Inline `Alert` (`components/ui/alert.tsx`).

## i18n and imports

- `t()` keys; English in `i18n/resources/en.ts`, every locale must match (`resources.test.ts`). `i18n/rebrand.ts` swaps "Paseo" → BRAND.name at load.
- Fork-owned app module: `packages/app/src/zekoder/` (planned by feature 006). BRAND lives in `packages/protocol/src/branding.ts`.
- App imports its own `package.json` (`utils/app-version.ts`); importing files outside `packages/app` through Metro is unverified (`metro.config.cjs` sets no `watchFolders`). Prefer a constant + fs-based drift test.

## Tests

- vitest + `@testing-library/react`, `/** @vitest-environment jsdom */`. Mock pattern for host runtime/features: `screens/settings/plugins-page.test.tsx`. Others: `plugins/registry*.test.ts*`, `plugins/sidebar-groups.test.ts`, `sidebar-nav/model.test.ts`, `components/sidebar-callout.test.tsx`, `utils/confirm-dialog.test.ts`.
