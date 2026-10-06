import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  MODEL_FAMILIES,
  acceptedModelFor,
  familyOf,
  isModelFamily,
  isStrictField,
  roleBindingProblem,
  roleControls,
  type AgentDefaultsPatch,
  type AgentSource,
  type AgentTab,
  type ConfigStatus,
  type HarnessModel,
  type ProviderOption,
  type RoleFields,
} from "../shared/config.js";
import { Chip } from "./chip.js";
import { Dropdown, Raise, type DropdownOption } from "./dropdown.js";
import { inputStyle } from "./styles.js";

type Theme = PluginSurfaceProps["theme"];
type State = ConfigStatus["agentDefaults"];

const INHERIT = "inherit";
/** Dropdown value for "no value at this tier": picking it clears this tier's field. */
const UNSET = "__unset__";
const TAB_LABELS: Record<AgentTab, string> = { planning: "Planning session", coding: "Coding session" };
const HINT_UNSUPPORTED = "Needs a newer zekoder-mcp";

/** Roles edited on the Planning tab; every other role (incl. any added later) goes to Coding. */
const PLANNING_ROLES: ReadonlySet<string> = new Set([
  "zekoder-planner-first-time",
  "zekoder-planner-agent",
  "zekoder-plan-reviewer",
  "zekoder-plan-reviewer-light",
  "zekoder-debt-agent",
  "zekoder-decision-agent",
  "zekoder-bug-report-agent",
  "zekoder-goals-agent",
  "zekoder-migrate-agent",
  "discovery",
]);

/** The session tab a role's defaults are edited on. */
export function roleTab(role: string): AgentTab {
  return PLANNING_ROLES.has(role) ? "planning" : "coding";
}

const TAB_FIELDS = ["provider", "model", "effort", "mode"] as const;
type TabField = (typeof TAB_FIELDS)[number];

type SaveFn = (patch: { set?: Record<string, string>; clear?: string[] }) => void;

/** Appends a stored value the options don't list, so the dropdown can still show it. */
function withCurrent(options: DropdownOption[], current: string | undefined, note = "not listed"): DropdownOption[] {
  if (current === undefined || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: `${current} (${note})` }];
}

/** Family choices for a provider, shown before `inherit` and the exact IDs. */
function familyOptions(provider: string | undefined): DropdownOption[] {
  return (provider ? (MODEL_FAMILIES[provider] ?? []) : []).map((family) => ({ value: family, label: `${family} (newest at launch)` }));
}

type Effort = HarnessModel["efforts"][number];

/** Efforts a model offers. For a family: the union over that family's own models (checked again at launch). */
function effortsFor(provider: string | undefined, model: string | undefined, models: readonly HarnessModel[]): Effort[] | null {
  if (!provider || !isModelFamily(provider, model)) return null;
  const seen = new Map<string, Effort>();
  for (const entry of models) {
    if (familyOf(provider, entry.id) !== model) continue;
    for (const effort of entry.efforts) if (!seen.has(effort.id)) seen.set(effort.id, effort);
  }
  return [...seen.values()];
}

export function Section({ theme, title, children }: { theme: Theme; title: string; children: React.ReactNode }) {
  return (
    <Raise style={{ gap: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foregroundMuted }}>{title.toUpperCase()}</Text>
      <Raise style={{ gap: 14 }}>{children}</Raise>
    </Raise>
  );
}

interface EditorProps {
  theme: Theme;
  /** The tier this editor writes and Resets. */
  scope: "repo" | "machine";
  /** Which session blocks to show. */
  tabs: readonly AgentTab[];
  /** Show each tab's role defaults under its session fields. */
  showRoles: boolean;
  state: State;
  providers: ProviderOption[];
  saving: boolean;
  error: string | null;
  onSave: (patch: AgentDefaultsPatch) => void;
}

/** Provider/model/effort/mode per session tab and native model/effort per role, with per-field sources. */
export function AgentDefaultsEditor({ theme, scope, tabs, showRoles, state, providers, saving, error, onSave }: EditorProps) {
  const enabled = state.supported && (scope !== "machine" || state.machineScope);
  const available = state.roster.providers.length > 0 ? providers.filter((p) => state.roster.providers.includes(p.id)) : providers;
  const save: SaveFn = (patch) => {
    if (!enabled || saving) return;
    onSave({ set: patch.set ?? {}, clear: patch.clear ?? [] });
  };
  const muted = { fontSize: 11, color: theme.colors.foregroundMuted };

  return (
    <Raise style={{ gap: 20 }}>
      {!enabled && <Text style={muted}>{HINT_UNSUPPORTED}</Text>}
      {error && <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>{error}</Text>}
      {state.activeProfile && (
        <Text style={muted}>Active execution profile: {state.activeProfile}. It overrides the fields it pins.</Text>
      )}
      {state.warnings.map((warning) => (
        <Text key={warning} style={muted}>
          {warning}
        </Text>
      ))}
      {tabs.map((tab) => (
        <TabBlock
          key={tab}
          theme={theme}
          scope={scope}
          tab={tab}
          showRoles={showRoles}
          state={state}
          providers={available}
          disabled={!enabled || saving}
          onSave={save}
        />
      ))}
    </Raise>
  );
}

/** Leaf paths this tier set for a tab: its session fields and the given roles under every provider. */
function ownedPaths(state: State, scope: "repo" | "machine", tab: AgentTab, roles: readonly string[]): string[] {
  const paths = TAB_FIELDS.filter((field) => state.sources[tab]?.[field] === scope).map((field) => `${tab}.${field}`);
  for (const [provider, byRole] of Object.entries(state.sources.roles ?? {})) {
    for (const role of roles) {
      for (const field of ["model", "effort"] as const) {
        if (byRole[role]?.[field] === scope) paths.push(`roles.${provider}.${role}.${field}`);
      }
    }
  }
  return paths;
}

/** One session tab: a single Reset for everything this tier set, the session fields, then its role defaults. */
function TabBlock({
  theme,
  scope,
  tab,
  showRoles,
  state,
  providers,
  disabled,
  onSave,
}: {
  theme: Theme;
  scope: "repo" | "machine";
  tab: AgentTab;
  showRoles: boolean;
  state: State;
  providers: ProviderOption[];
  disabled: boolean;
  onSave: SaveFn;
}) {
  const [confirming, setConfirming] = useState(false);
  const roles = showRoles ? state.roster.roles.filter((role) => roleTab(role) === tab) : [];
  const owned = ownedPaths(state, scope, tab, roles);
  const name = TAB_LABELS[tab].replace(" session", "").toLowerCase();
  useEffect(() => {
    if (owned.length === 0) setConfirming(false);
  }, [owned.length]);

  return (
    <Section theme={theme} title={TAB_LABELS[tab]}>
      {owned.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Chip
            theme={theme}
            label={confirming ? `Confirm: clear ${owned.length} ${scope} field${owned.length === 1 ? "" : "s"}` : `Reset ${name} defaults`}
            selected={confirming}
            onPress={() => {
              if (disabled) return;
              if (!confirming) return setConfirming(true);
              setConfirming(false);
              onSave({ clear: owned });
            }}
          />
          {confirming && <Chip theme={theme} label="Cancel" selected={false} onPress={() => setConfirming(false)} />}
        </View>
      )}
      <SessionBlock theme={theme} tab={tab} state={state} providers={providers} disabled={disabled} onSave={onSave} />
      {roles.length > 0 && (
        <RolesBlock
          theme={theme}
          scope={scope}
          tab={tab}
          roles={roles}
          state={state}
          providers={providers}
          disabled={disabled}
          onSave={onSave}
        />
      )}
    </Section>
  );
}

/** The source line under a set value: `<value> · <source>` (a profile also says it overrides). */
function SourceLine({
  theme,
  value,
  source,
  profile,
  ignored,
}: {
  theme: Theme;
  value: string | undefined;
  source: AgentSource | undefined;
  profile: string | null;
  ignored: boolean;
}) {
  if (value === undefined || !source) return null;
  const label = source === "profile" ? `profile (${profile ?? "active"})` : source;
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>
        {value} · {label}
      </Text>
      {source === "profile" && (
        <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>The execution profile overrides this field.</Text>
      )}
      {ignored && (
        <Text style={{ fontSize: 11, color: theme.colors.statusDanger }}>ignored: set for another provider</Text>
      )}
    </View>
  );
}

function SessionBlock({
  theme,
  tab,
  state,
  providers,
  disabled,
  onSave,
}: {
  theme: Theme;
  tab: AgentTab;
  state: State;
  providers: ProviderOption[];
  disabled: boolean;
  onSave: SaveFn;
}) {
  const values = state.values[tab] ?? {};
  const sources = state.sources[tab] ?? {};
  const provider = providers.find((entry) => entry.id === values.provider);
  const models = provider?.models ?? [];
  const model = values.model && values.model !== INHERIT ? models.find((entry) => entry.id === values.model) : undefined;
  const defaultModel = models.find((entry) => entry.isDefault);
  const effortModel = model ?? (!values.model || values.model === INHERIT ? defaultModel : undefined);
  const familyEfforts = effortsFor(values.provider, values.model, models);
  const efforts = familyEfforts ?? effortModel?.efforts ?? [];
  const modes = provider?.modes ?? [];
  const path = (field: TabField) => `${tab}.${field}`;

  const offers: Record<TabField, boolean> = {
    provider: true,
    model:
      !values.model ||
      values.model === INHERIT ||
      isModelFamily(values.provider ?? "", values.model) ||
      models.some((entry) => entry.id === values.model),
    effort: !values.effort || efforts.some((entry) => entry.id === values.effort),
    mode: !values.mode || modes.some((entry) => entry.id === values.mode),
  };
  /** A soft field (lower tier than the provider's) that the resolved provider doesn't offer is ignored at launch. */
  const ignored = (field: TabField): boolean => {
    const fieldSource = sources[field];
    const providerSource = sources.provider;
    if (field === "provider" || !fieldSource || !providerSource || !provider) return false;
    return !isStrictField(fieldSource, providerSource) && !offers[field];
  };

  const withUnset = (label: string, options: DropdownOption[], current: string | undefined) =>
    withCurrent([{ value: UNSET, label }, ...options], current);
  const providerOptions = withCurrent(
    providers.map((entry) => ({ value: entry.id, label: entry.label })),
    values.provider || undefined,
    "not available",
  );

  const line = (field: TabField) => (
    <SourceLine
      theme={theme}
      value={values[field]}
      source={sources[field]}
      profile={state.activeProfile}
      ignored={ignored(field)}
    />
  );
  const pick = (field: Exclude<TabField, "provider">) => (next: string) =>
    next === UNSET ? onSave({ clear: [path(field)] }) : onSave({ set: { [path(field)]: next } });

  const onModel = (next: string) => {
    if (next === UNSET) return onSave({ clear: [path("model")] });
    const pickedEfforts =
      effortsFor(values.provider, next, models) ?? (next === INHERIT ? defaultModel : models.find((entry) => entry.id === next))?.efforts;
    const dropEffort = values.effort !== undefined && pickedEfforts !== undefined && !pickedEfforts.some((entry) => entry.id === values.effort);
    onSave({ set: { [path("model")]: next }, ...(dropEffort ? { clear: [path("effort")] } : {}) });
  };

  return (
    <Raise style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
      <FieldColumn theme={theme} label="Provider">
        <Dropdown
          theme={theme}
          label={`${tab} provider`}
          value={values.provider ?? null}
          options={providerOptions}
          placeholder="Provider default"
          width={170}
          disabled={disabled}
          onChange={(next) =>
            // Leaf clear paths only: set and clear may not overlap at any level.
            onSave({ set: { [path("provider")]: next }, clear: [path("model"), path("effort"), path("mode")] })
          }
        />
        {line("provider")}
      </FieldColumn>
      <FieldColumn theme={theme} label="Model">
        <Dropdown
          theme={theme}
          label={`${tab} model`}
          value={values.model ?? null}
          options={withUnset(
            "Provider default",
            [...familyOptions(values.provider), { value: INHERIT, label: "inherit (provider default)" }, ...models.map((entry) => ({ value: entry.id, label: entry.label }))],
            values.model,
          )}
          placeholder="Provider default"
          width={200}
          disabled={disabled || !provider}
          onChange={onModel}
        />
        {line("model")}
      </FieldColumn>
      <FieldColumn theme={theme} label="Effort">
        <Dropdown
          theme={theme}
          label={`${tab} effort`}
          value={values.effort ?? null}
          options={withUnset(
            "Default effort",
            efforts.map((entry) => ({ value: entry.id, label: entry.label })),
            values.effort,
          )}
          placeholder="Provider default"
          width={150}
          disabled={disabled || !provider || (efforts.length === 0 && !values.effort)}
          onChange={pick("effort")}
        />
        {familyEfforts && (
          <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>checked at launch</Text>
        )}
        {line("effort")}
      </FieldColumn>
      <FieldColumn theme={theme} label="Access mode">
        <Dropdown
          theme={theme}
          label={`${tab} mode`}
          value={values.mode ?? null}
          options={withUnset(
            "Default mode",
            modes.map((entry) => ({ value: entry.id, label: entry.label })),
            values.mode,
          )}
          placeholder="Provider default"
          width={170}
          disabled={disabled || !provider || (modes.length === 0 && !values.mode)}
          onChange={pick("mode")}
        />
        {line("mode")}
      </FieldColumn>
    </Raise>
  );
}

function FieldColumn({ theme, label, children }: { theme: Theme; label: string; children: React.ReactNode }) {
  return (
    <Raise style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, color: theme.colors.foreground }}>{label}</Text>
      {children}
    </Raise>
  );
}

function RolesBlock({
  theme,
  scope,
  tab,
  roles,
  state,
  providers,
  disabled,
  onSave,
}: {
  theme: Theme;
  scope: "repo" | "machine";
  tab: AgentTab;
  roles: readonly string[];
  state: State;
  providers: ProviderOption[];
  disabled: boolean;
  onSave: SaveFn;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const roleProviders = state.roster.providers;
  const activeProvider = picked ?? state.values[tab]?.provider ?? roleProviders[0] ?? null;
  if (roleProviders.length === 0 || !activeProvider) return null;
  const models = providers.find((entry) => entry.id === activeProvider)?.models ?? [];

  return (
    <Raise style={{ gap: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foreground }}>Role defaults</Text>
      <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>
        Native model/effort per provider and built-in role. Unset = the agent's own default; "inherit" = explicitly keep the
        session model. Each field saves on its own.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {roleProviders.map((id) => (
          <Chip key={id} theme={theme} label={id} selected={id === activeProvider} onPress={() => setPicked(id)} />
        ))}
      </View>
      {roles.map((role) => (
        <RoleRow
          key={`${activeProvider}:${role}`}
          theme={theme}
          scope={scope}
          provider={activeProvider}
          role={role}
          fields={state.values.roles?.[activeProvider]?.[role] ?? {}}
          sources={state.sources.roles?.[activeProvider]?.[role] ?? {}}
          profile={state.activeProfile}
          models={models}
          disabled={disabled}
          onSave={onSave}
        />
      ))}
    </Raise>
  );
}

interface RoleRowProps {
  theme: Theme;
  scope: "repo" | "machine";
  provider: string;
  role: string;
  /** Resolved fields; an absent field = the agent's own default. */
  fields: RoleFields;
  sources: { model?: AgentSource; effort?: AgentSource };
  profile: string | null;
  /** Live models of the provider; empty = list unavailable, so the row falls back to free text. */
  models: readonly HarnessModel[];
  disabled: boolean;
  onSave: SaveFn;
}

function RoleRow(props: RoleRowProps) {
  const { theme, scope, provider, role, fields, sources, profile, models, disabled, onSave } = props;
  const controls = roleControls(provider, role);
  const base = `roles.${provider}.${role}`;
  const hasFields = fields.model !== undefined || fields.effort !== undefined;
  // A stored binding the host can't run. Without a model only the effort is checked.
  const problem = hasFields ? roleBindingProblem(provider, role, { model: fields.model ?? INHERIT, effort: fields.effort }) : null;
  const fixModel = fields.model && (controls.model ? (acceptedModelFor(provider, role, fields.model) ?? INHERIT) : INHERIT);
  const ownsFix = sources.model === scope || sources.effort === scope;
  const fix =
    problem && ownsFix && (
      <Chip
        theme={theme}
        label={fixModel && fixModel !== fields.model ? `Use ${fixModel}` : "Remove effort"}
        selected={false}
        onPress={() =>
          !disabled &&
          onSave(
            fixModel && fixModel !== fields.model
              ? { set: { [`${base}.model`]: fixModel }, clear: fields.effort && !controls.effort ? [`${base}.effort`] : [] }
              : { clear: [`${base}.effort`] },
          )
        }
      />
    );
  const limit = !controls.model
    ? `${provider} can't set a model or effort for ${role}; only inherit works.`
    : !controls.effort
      ? `${provider} has no effort control for ${role}.`
      : null;

  return (
    <Raise style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, color: theme.colors.foreground }}>{role}</Text>
      <Raise style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {models.length > 0 || controls.models ? (
          <RoleDropdowns {...props} controls={controls} />
        ) : (
          <RoleTextInputs {...props} controls={controls} />
        )}
        {fix}
      </Raise>
      {(["model", "effort"] as const).map((field) => (
        <SourceLine key={field} theme={theme} value={fields[field]} source={sources[field]} profile={profile} ignored={false} />
      ))}
      {problem ? (
        <Text style={{ fontSize: 11, color: theme.colors.statusDanger }}>{problem}</Text>
      ) : (
        limit && <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{limit}</Text>
      )}
    </Raise>
  );
}

type RoleSubProps = RoleRowProps & { controls: ReturnType<typeof roleControls> };

/** A choice saves one field; changing the model drops the effort only if the new model doesn't offer it. */
function RoleDropdowns({ theme, provider, role, fields, models, disabled, onSave, controls }: RoleSubProps) {
  const base = `roles.${provider}.${role}`;
  const { model, effort } = fields;
  const familyEfforts = effortsFor(provider, model, models);
  const current = models.find((entry) => entry.id === model);

  // A closed host list (Claude task roles) replaces Paseo's native IDs, which that host rejects.
  const choices = !controls.model
    ? []
    : controls.models
      ? controls.models.map((value) => ({ value, label: value }))
      : models.map((entry) => ({ value: entry.id, label: entry.label }));
  // Families come first; Claude task roles already list only families.
  const families = controls.model && !controls.models ? familyOptions(provider) : [];
  const modelOptions = withCurrent(
    [{ value: UNSET, label: "Agent default (unset)" }, ...families, { value: INHERIT, label: "Inherit session model" }, ...choices],
    model,
  );
  const effortOptions = withCurrent(
    [{ value: UNSET, label: "Default effort" }, ...(familyEfforts ?? current?.efforts ?? []).map((entry) => ({ value: entry.id, label: entry.label }))],
    effort,
  );

  return (
    <>
      <Dropdown
        theme={theme}
        label={`${role} model`}
        value={model ?? null}
        options={modelOptions}
        placeholder="Agent default"
        width={220}
        disabled={disabled}
        onChange={(next) => {
          if (next === UNSET) return onSave({ clear: [`${base}.model`] });
          const pickedEfforts = effortsFor(provider, next, models) ?? models.find((entry) => entry.id === next)?.efforts;
          const drop = effort !== undefined && (!controls.effort || (pickedEfforts !== undefined && !pickedEfforts.some((e) => e.id === effort)));
          onSave({ set: { [`${base}.model`]: next }, ...(drop ? { clear: [`${base}.effort`] } : {}) });
        }}
      />
      <Dropdown
        theme={theme}
        label={`${role} effort`}
        value={effort ?? null}
        options={effortOptions}
        placeholder="Effort"
        width={150}
        disabled={disabled || !controls.effort || model === undefined || model === INHERIT || effortOptions.length === 1}
        onChange={(next) => onSave(next === UNSET ? { clear: [`${base}.effort`] } : { set: { [`${base}.effort`]: next } })}
      />
      {familyEfforts && <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>checked at launch</Text>}
    </>
  );
}

/** Fallback when Paseo cannot list this provider's models: free-text entry. */
function RoleTextInputs({ theme, provider, role, fields, disabled, onSave, controls }: RoleSubProps) {
  const base = `roles.${provider}.${role}`;
  const [model, setModel] = useState(fields.model ?? "");
  const [effort, setEffort] = useState(fields.effort ?? "");
  useEffect(() => {
    setModel(fields.model ?? "");
    setEffort(fields.effort ?? "");
  }, [fields.model, fields.effort]);

  const dirty = model.trim() !== (fields.model ?? "") || effort.trim() !== (fields.effort ?? "");
  const input = { ...inputStyle(theme), paddingHorizontal: 8, paddingVertical: 4 };
  const commit = (nextModel: string, nextEffort: string) => {
    const set: Record<string, string> = {};
    const m = nextModel.trim();
    const e = controls.effort ? nextEffort.trim() : "";
    if (m !== "") set[`${base}.model`] = m;
    if (e !== "") set[`${base}.effort`] = e;
    if (Object.keys(set).length > 0) onSave({ set });
  };

  return (
    <>
      {controls.model && (
        <TextInput
          value={model}
          onChangeText={setModel}
          placeholder="model ID or inherit"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCapitalize="none"
          style={{ width: 180, ...input }}
        />
      )}
      {controls.effort && (
        <TextInput
          value={effort}
          onChangeText={setEffort}
          placeholder="effort (optional)"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCapitalize="none"
          style={{ width: 120, ...input }}
        />
      )}
      {controls.model && (
        <Chip theme={theme} label="Save" selected={false} onPress={() => dirty && !disabled && commit(model, effort)} />
      )}
      <Chip theme={theme} label="Inherit" selected={false} onPress={() => !disabled && commit(INHERIT, effort)} />
    </>
  );
}
