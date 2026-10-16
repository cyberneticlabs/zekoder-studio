---
id: 011-remove-hoplite-builtin
type: followup
title: Remove upstream Hoplite built-in provider from Zekoder bundle
status: planned
createdAt: 2026-10-16
openedAt: 2026-10-16T15:50:14.486Z
updatedAt: 2026-10-16T15:51:39.367Z
origin: zekoder-planner-agent
filedFromTask: null
branch: followup-011-remove-hoplite-builtin
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
## Summary

Stop shipping upstream's Hoplite ACP provider (brought in by sync merge 7b19c3417, upstream main@c1558d29e) in the Zekoder build, using the smallest fork diff so future upstream syncs stay cheap.

## Why it's out of scope now

The sync merge was kept mechanical. The user then decided Zekoder must not ship Hoplite (upstream's first sponsor). It is opt-in (`requiresConfiguration: true`) and inert until a user adds it from the provider catalog, so nothing is broken today. Removal is a deliberate fork-policy change that needs its own small, reviewable commit.

## Proposed approach

Exclude, do not delete. Keep `plugins/hoplite-provider/` on disk so upstream edits to it merge cleanly. Delete it only if the user later prefers a physically smaller tree: that costs a modify/delete conflict on every upstream edit (`git log -- plugins/hoplite-provider` shows it already churned twice, #6953 and 7aa3fac06). See `plan.md` ("keep fork changes small and isolated, preserve upstream directories").

Touch points, confirmed in the tree:

1. Load gate. Remove `"hoplite-provider"` from `builtinPlugins` in `packages/server/src/server/plugins/builtin/index.ts` (line 11). `BuiltinPluginLoader` and `resolveEnabledBuiltinPlugins` in `bootstrap.ts:500` read this list, so the daemon never loads or registers it.
   - Alternative (not recommended): the `PASEO_DISABLE_BUILTIN_PLUGINS` env var is documented as test/diagnostic only and is not set for a packaged daemon, so it does not meet the acceptance bar. Do not use it.
2. Packaging. `packages/server/package.json` `build:lib` copies all of `../../plugins` into `dist/server/builtin-plugins` (electron-builder.yml `extraResources` then ships that directory). Add one filter clause so `hoplite-provider` is not copied (the existing `filter:(source)=>...` already excludes `node_modules` and tests). Do not edit `packages/desktop/electron-builder.yml`.
3. App catalog. Remove the `id: "hoplite"` entry (lines ~242-251) from `packages/app/src/data/acp-provider-catalog.ts`. Update `packages/app/src/hooks/use-acp-provider-catalog.test.ts` (lines ~47, 63-76: command assertion, "offers Hoplite..." test, ordering asserts) and `packages/app/e2e/browser/acp-provider-catalog.spec.ts` (Hoplite add/remove, unsupported-host, and model-selector tests; the whole file is Hoplite-driven except the helpers, so remove the Hoplite tests or the file).
4. Leave unchanged (zero diff, by design):
   - `hopliteProvider` in `packages/protocol/src/messages.ts:3722-3723` (COMPAT-tagged, optional wire field; the protocol must stay backward compatible, never remove it).
   - `packages/server/src/server/websocket-server.ts:1920`. With the plugin not loaded, `supportsConfigRequiredProvider("hoplite")` returns false, so the flag is no longer advertised.
   - `useHostFeature(serverId, "hopliteProvider")` plumbing in `packages/app/src/screens/settings/providers-section.tsx:332` and `buildAcpProviderConfigPatch`'s `supportsHopliteProvider` arg in `use-acp-provider-catalog.ts` (inert once the catalog entry is gone; the `bundledProvider` flag stays for other future entries).
   - `"hoplite"` in `packages/protocol/src/provider-icon-names.ts` and `packages/app/src/assets/acp-provider-icons.ts` (icon registry; harmless).
5. Tests that depend on the plugin loading:
   - `packages/server/src/server/daemon-e2e/models.e2e.test.ts:167` ("bundled Hoplite requires a config entry...", line 176 lists `"hoplite-provider"` explicitly) and its helper `daemon-e2e/hoplite-fixture.cjs`: delete the test and fixture.
   - `packages/server/src/server/websocket-server.relay-reconnect.test.ts:1144` asserts `features.hopliteProvider` is `false`; it should still pass, so confirm and keep.
   - `packages/protocol/src/messages.checkout-pr-schema.test.ts:817` tests the optional wire field; keep.
   - `packages/app/e2e/browser/hoplite-model-discovery.real.spec.ts`: delete (a real-account e2e that cannot run without the plugin).
   - `packages/server/src/server/plugins/builtin/index.test.ts` iterates `builtinPlugins`; confirm it passes and has no check that every directory under `plugins/` is listed. Adjust if it does.
   - The `plugins/hoplite-provider/server/run-phase.test.ts` unit test still runs under the `@getpaseo/builtin-plugins` workspace (`npm run typecheck:server`); it keeps compiling because the directory stays.
6. Docs. `docs/plugins.md:125` ("Hoplite uses this for catalog opt-in") names Hoplite as the example for `requiresConfiguration`; reword to "upstream's Hoplite provider (not shipped in Zekoder)" or a neutral example. Add one short note, in the doc that owns built-in plugins (`docs/plugins.md`, near line 92), that `plugins/hoplite-provider/` is an upstream-preserved directory deliberately absent from `builtinPlugins` and the build copy, so future syncs must not re-add it. `public-docs/supported-providers.md` (lines 88, 105-117) has a Hoplite section; remove it if that file is the Zekoder-published copy (confirm during implementation).

Out of scope unless the user says otherwise: Hoplite sponsor branding in `README*.md`, `CHANGELOG.md`, and `packages/website` (`src/data/sponsors.ts`, `public/sponsors/hoplite-*.svg`, `e2e/sponsors.spec.ts`). That is a separate branding decision, not a provider-shipping one. <!-- TODO: ask the user whether sponsor placement should also go. -->

## Tasks

1. `packages/server/src/server/plugins/builtin/index.ts`: remove `"hoplite-provider"` from `builtinPlugins`.
2. `packages/server/package.json` (`build:lib`): add a `cpSync` filter clause to skip `hoplite-provider`.
3. `packages/app/src/data/acp-provider-catalog.ts`: delete the Hoplite entry.
4. `packages/app/src/hooks/use-acp-provider-catalog.test.ts`: remove or adjust the Hoplite assertions.
5. `packages/app/e2e/browser/acp-provider-catalog.spec.ts`: remove the Hoplite tests (or the file if nothing else remains).
6. Delete `packages/app/e2e/browser/hoplite-model-discovery.real.spec.ts`.
7. `packages/server/src/server/daemon-e2e/models.e2e.test.ts`: delete the Hoplite opt-in test; delete `daemon-e2e/hoplite-fixture.cjs`.
8. `docs/plugins.md` (and `public-docs/supported-providers.md` if applicable): update as in touch point 6.
9. Leave `plugins/hoplite-provider/`, the protocol feature flag, and `websocket-server.ts` untouched.

## Verification

- `npm run typecheck` and `npm run lint`.
- `npx vitest run packages/server/src/server/plugins/builtin/index.test.ts packages/app/src/hooks/use-acp-provider-catalog.test.ts packages/server/src/server/websocket-server.relay-reconnect.test.ts packages/protocol/src/messages.checkout-pr-schema.test.ts --bail=1` (one file per run; never the full suite).
- `npm run build:lib --workspace=@getpaseo/server`, then `ls packages/server/dist/server/builtin-plugins` shows no `hoplite-provider`.
- A daemon snapshot has no `hoplite` entry and `server_info.features.hopliteProvider` is not true; the provider catalog in Settings has no Hoplite row.
- `git diff --stat` for this change touches no file under `plugins/hoplite-provider/` or `packages/protocol/`.
- Next upstream sync: conflicts are limited to the one-line list and the catalog entry.
