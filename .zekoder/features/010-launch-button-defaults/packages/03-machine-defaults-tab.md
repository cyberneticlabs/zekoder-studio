# Package 03 — Machine Defaults tab and provider onboarding

**Branch:** `010-launch-button-defaults-03-machine-defaults-tab`
**Worktree:** supervisor-provided, branched after 01 and 02 merge. Run `cd plugins/zekoder && npm ci` first.
**Depends on:** 01, 02. **Consumes contracts:** `agent-defaults-client-model`,
`agent-defaults-editor`, `launch-result`, `agent-defaults-config-surface`.

## Context

All paths under `plugins/zekoder/`. Read `docs/paseo-plugin-project-scope.md` first: a sidebar item plus
`addSurface` is **global** and gets no workspace or root in its props.

- `client/zekoder-surface.tsx` — the global "Zekoder" page (`addSurface("zekoder")`,
  `index.client.tsx:13`). `TabBar` with `reports` and `version` (:11, :27-39). The machine panel is a
  third tab here, not a new sidebar item and not a workspace panel.
- `client/version-panel.tsx` / `shared/version.ts` (`versionStatusRpc`, input `{}`) — the pattern for
  a root-less RPC plus `useQuery`.
- `client/start-agent-button.tsx` — `StartAgentButton` (`start()` → result, then
  `navigation.openAgent`). Used by `issue-detail.tsx` (Implement :102-109, Promote :116-123) and
  `issues-tab.tsx` (Migrate :205-220). `issue-detail.tsx` already uses `Modal` from
  `@getpaseo/plugin/client/react-native` (:178-187).
- `server/zekoder.ts`: `callTool(root, …)` pools one MCP client per root; `zekoderProjects(paseo)`
  (:354-369) lists roots with `.zekoder/`; `toAgentDefaultsState` (01).
- `server/config.ts`: `toSetConfigArgs(patch, scope)` and `listProviders` (01).
- Machine scope needs a repo `cwd` until zekoder-mcp feature 022 ships no-`cwd` calls. The
  machine-only read (followup 050 or feature 022, whichever lands first) is used only when
  `MACHINE_SCOPE_FLAG` is true. Its payload differs between the two (022 adds `workflow`,
  `executionProfiles`, `supportedHarnessAgents`, `telemetry`). Read only `agentDefaults`,
  `machineConfigPath` and `warnings`; ignore every other field (external dependency 1).

## Tasks

- [x] 1. **RPCs** — `shared/config.ts`: `getMachineDefaultsRpc` (`"zekoder.defaults.get"`, input `{root?: string}`)
  and `setMachineDefaultsRpc` (`"zekoder.defaults.set"`, input `{root?: string, agentDefaults:
  agentDefaultsPatchSchema}`). Both output `{state: ConfigStatus["agentDefaults"] | null,
  transportRoot: string | null, error: string | null}`.
- [x] 2. **Server** — `server/config.ts`:
  - `machineTransportRoot(paseo, root?)`: candidates = `root` first (when given and a Zekoder
    project), then `zekoderProjects(paseo)`. Do a plain `zekoder_get_config {cwd}` read on each and
    **stop at the first** whose state has `supported && machineScope`. None matches → use the first
    candidate and its plain state as read (disabled, so the tab shows the hint). No project →
    `state: null`.
  - `getMachineDefaults`: only when the flag was seen, call `zekoder_get_config {cwd, scope:
    "machine"}`. Parse only `agentDefaults`, `machineConfigPath` and `warnings` (a loose schema, so
    extra fields never fail the parse). Build the state: `values` = its `agentDefaults ?? {}`; `sources` generated (every set leaf
    = `machine`); `supported`, `machineScope` and `roster` from the transport root's plain read;
    `activeProfile: null`; warnings merged. Never derive machine values from the resolved read.
  - `setMachineDefaults`: refuse unless the capability was seen; send `toSetConfigArgs(patch,
    "machine")`; re-read. Never write `~/.zekoder-mcp/config.json` directly.
  - Register both RPCs in `index.server.ts`.
- [x] 3. **Defaults tab** — new `client/machine-defaults-panel.tsx` `MachineDefaultsPanel({theme})`:
  queries `getMachineDefaultsRpc` and `listProvidersRpc` (no root). Renders `AgentDefaultsEditor
  scope="machine" tabs={["planning", "coding"]} roleFilter={() => true}` inside a `ScrollView`.
  Intro line: "Machine defaults apply to every repo unless the repo or its execution profile sets the
  field." Footer: "Saved through zekoder-mcp of <transport project name>." `state: null` → "Open a
  Zekoder project in Paseo first."
- [x] 4. **Onboarding** — new `client/provider-onboarding.tsx` `ProviderOnboarding({theme, onDone})`:
  the same two queries, `AgentDefaultsEditor scope="machine" tabs={["planning", "coding"]}
  roleFilter={null}`, plus a "Done" button enabled once both machine providers are set. It is a thin
  wrapper; no extra steps or wizard.
- [x] 5. **Wire it** — `client/zekoder-surface.tsx`: add `"defaults"` to `TabId` and a "Defaults" tab
  rendering `MachineDefaultsPanel`. Above the tabs, a "Set up providers" banner while the machine
  state has `machineScope` true and the planning or coding provider is unset (never when
  `machineScope` is false); pressing it selects the Defaults tab.
  Update the surface comment (:13). Add "defaults" and "providers" to the `open-zekoder-settings`
  keywords in `index.client.tsx`.
- [x] 6. **Launch hook** — `client/start-agent-button.tsx` (replaces 02's plain text). On
  `status: "needs-onboarding"`, query `getMachineDefaultsRpc` with the launch's `root`:
  - `machineScope` true → show `ProviderOnboarding` in a `Modal` ("No <tab> provider is set yet.
    Pick one to continue."); on Done, close it and run `start()` again.
  - `machineScope` false (023 without the machine-scope flag) → no editor; show "No <tab> provider is set yet. Set it
    in this project's Zekoder settings → <Planning|Coding> tab."
  Pass `root` into `StartAgentButton` from `issue-detail.tsx` and `issues-tab.tsx`.
- [x] 7. **Docs** — `README.md`: the Zekoder page Defaults tab (machine tier, written through
  zekoder-mcp of the named project, old-bundle hint), the "Set up providers" banner, and launch
  onboarding. Add the new client files to the Layout list.

## Verification

- `cd plugins/zekoder && npm run typecheck`.
- Reload the plugin and the app window. Current bundle: the Defaults tab shows disabled controls and
  "Needs a newer zekoder-mcp"; no banner; launches never show onboarding.
- New bundle: steps 10–12 of `../get-started.md`.

## Progress

- Status: ready for review
- Completed tasks: 7/7
- Gate: `cd plugins/zekoder && npm run typecheck` pass
- Reviewer notes: pending
