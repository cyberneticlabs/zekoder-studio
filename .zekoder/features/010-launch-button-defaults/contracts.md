# Contracts — 010-launch-button-defaults

All plugin paths are under `plugins/zekoder/`.

## agent-defaults-client-model

- **Type**: internal · **Kind**: store
- **Owner**: 01 · **Consumers**: 02, 03
- **Signature / payload** (`shared/config.ts`):

  ```ts
  export const AGENT_TABS = ["planning", "coding"] as const;   // planning = Promote, coding = Implement
  export type AgentTab = (typeof AGENT_TABS)[number];
  export const AGENT_SOURCES = ["profile", "repo", "machine"] as const; // high -> low; no factory tier
  export type AgentSource = (typeof AGENT_SOURCES)[number];
  // Every field optional. Strings stored as given (no family translation here).
  export type TabDefaults = { provider?: string; model?: string; effort?: string; mode?: string };
  export type RoleFields = { model?: string; effort?: string };
  export type AgentDefaults = { planning?: TabDefaults; coding?: TabDefaults;
    roles?: Record<string /*provider*/, Record<string /*role*/, RoleFields>> };
  export type AgentDefaultsSources = /* same tree as AgentDefaults, leaves = AgentSource */;

  // configStatusSchema gains (01 also KEEPS the legacy `roleDefaults` field and
  // `RoleDefaultsValues` so the launch code still typechecks; 02 removes them):
  agentDefaults: {
    supported: boolean;            // true when get_config has `sources.agentDefaults` (always added by 023)
    machineScope: boolean;         // MACHINE_SCOPE_FLAG (`capabilities.machineScopeRead`) is true
    values: AgentDefaults;         // resolved per field by zekoder-mcp; absent = unset everywhere
    sources: AgentDefaultsSources; // one leaf per present value
    roster: { providers: string[]; roles: string[] }; // from raw `roleDefaults.available` (harnesses -> providers), both bundles
    activeProfile: string | null;  // read-only, display only
    warnings: string[];
  }

  // One patch per save. Paths are dotted field paths:
  //   "planning.provider|model|effort|mode", "coding.<same>",
  //   "roles.<provider>.<role>.model|effort"
  export const agentDefaultsPatchSchema = z.object({
    set: z.record(z.string(), z.string().min(1)).default({}),
    clear: z.array(z.string()).default([]),
  });
  // setConfigRpc input: `roleDefault` replaced by `agentDefaults?: AgentDefaultsPatch` (repo scope).

  /** One available provider: Paseo enabled + ready, and in `roster.providers`. */
  export type ProviderOption = { id: string; label: string; models: HarnessModel[];
    modes: { id: string; label: string }[]; defaultModeId: string | null };
  // listProvidersRpc "zekoder.config.providers": input {root?: string} -> {providers: ProviderOption[], error: string | null}

  /** Soft/strict rule. A field is strict when its tier is the same as, or higher than, the tier
   *  that set the provider. A soft field (from a lower tier) is used only if the provider offers it. */
  export function isStrictField(fieldSource: AgentSource, providerSource: AgentSource): boolean;
  ```

- **Rules**: `set` and `clear` may not overlap at any level: no `clear` path may be a prefix of a
  `set` path, or the reverse (zekoder-mcp 023 rejects it with `validation-failed`). So a provider
  change sends `set planning.provider` plus `clear planning.model|effort|mode` (leaf paths), never
  `clear planning`. Clearing falls to the next lower tier. A tab field unset in every tier is
  omitted at launch, so the provider's own default applies. A role field unset in every tier is not
  passed, so the agent's own default (or `inherit`) applies. `model: "inherit"` on a tab means the
  provider default (a fresh session has no parent). `set` keys use only providers in
  `roster.providers` and roles in `roster.roles`; anything else is `validation-failed`. On an old
  bundle, `values` and `sources` are empty: no saved value is shown and controls stay disabled. The
  plugin never reads `roleDefaults.values` (zekoder-mcp followup 051 removes it).

## agent-defaults-editor

- **Type**: internal · **Kind**: component
- **Owner**: 01 · **Consumers**: 03
- **Signature / payload** (`client/agent-defaults.tsx`):

  ```tsx
  export function AgentDefaultsEditor(props: {
    theme: Theme;
    scope: "repo" | "machine";          // the tier this editor writes and Resets
    tabs: readonly AgentTab[];          // which session blocks to show
    roleFilter: ((role: string) => boolean) | null; // null = hide the roles block
    state: ConfigStatus["agentDefaults"];
    providers: ProviderOption[];
    saving: boolean;
    error: string | null;
    onSave: (patch: AgentDefaultsPatch) => void;
  }): JSX.Element;
  ```

  Shows each set value with its source label; an unset field shows "provider default". Disabled with
  the hint "Needs a newer zekoder-mcp" when `state.supported` is false (or, for `scope="machine"`,
  when `state.machineScope` is false). Must sit under `Raise`/`Section` (`client/dropdown.tsx`).

## launch-result

- **Type**: internal · **Kind**: edge-function
- **Owner**: 02 · **Consumers**: 03
- **Signature / payload** (`shared/issues.ts`): `implementIssueRpc`, `promoteIdeaRpc` and
  `migrateWorkspaceRpc` output becomes
  `{status: "started", agentId, workspaceId} | {status: "needs-onboarding", tab: AgentTab}`.
  `needs-onboarding` is returned only when a supported bundle resolves no provider for that tab.
  02 shows it as the plain text "No <tab> provider is set yet."; 03 decides what to show by
  machine capability (see package 03).

## agent-defaults-config-surface

- **Type**: cross-system · **Counterpart**: `cyberneticlabs/zekoder-mcp` (feature
  023-launch-defaults-layered-config, feature 022-central-config-defaults contract
  `machine-config-surface`, followup 050-machine-only-agent-defaults-read, decisions 003 and 004)
- **External dependency**: 1 · **Owner**: 01 · **Consumers**: 02, 03
- **Signature / payload** (the plugin follows the final shape):
  - `zekoder_get_config {cwd}` (023) → `agentDefaults` (resolved per field: profile > repo >
    machine; absent = no tier set, there is no factory), `sources.agentDefaults` (same tree, leaves
    `machine|repo|profile`; always present on 023, so it is the support signal),
    `machineConfigPath`, `executionProfiles {profiles, active?}`, `warnings?`. The roster stays in
    `roleDefaults.available {harnesses, roles}`: harnesses are `claude|codex|omp|opencode`, roles
    include `discovery` and `simplify`. Legacy `roleDefaults.values` is never read, on any bundle. The machine-scope flag
    (suggested `capabilities.machineScopeRead`) is read through one constant, `MACHINE_SCOPE_FLAG`.
  - `zekoder_get_config {cwd, scope: "machine"}` → the unmerged machine tier, no `sources`. Defined
    by 050 as `{ok, scope, agentDefaults, machineConfigPath, warnings?}` and by 022 as `{ok, scope,
    machineConfigPath, workflow?, agentDefaults?, executionProfiles?, supportedHarnessAgents?,
    telemetry, warnings?}` (022 needs no `cwd`; the plugin still sends one). The plugin reads only
    `agentDefaults`, `machineConfigPath` and `warnings`, and ignores every other field. Sent only
    when the flag was seen on a plain read.
  - `zekoder_set_config {cwd, scope: "repo" | "machine", agentDefaults?, clear?: string[]}`; clear
    paths are `agentDefaults.<field path>`. Sent only with an `agentDefaults` patch; workflow and
    telemetry calls never carry `scope`/`clear`/`agentDefaults`. The plugin never sends
    `roleDefaults` (023 rejects it). Errors: `validation-failed`, `locked` with `retryAfterMs`
    (shown as an error; the user saves again).
