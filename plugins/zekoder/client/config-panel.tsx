import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  BRANCH_DELETION_MODES,
  DEFAULT_MERGE_MODES,
  PLANNING_TIERS,
  REVIEWER_POLICIES,
  SIMPLIFY_MODES,
  WORKTREE_CLEANUP_MODES,
  getConfigRpc,
  listProvidersRpc,
  setConfigRpc,
  type AgentDefaultsPatch,
  type ConfigStatus,
  type WorkflowConfig,
  type WorkflowPatch,
} from "../shared/config.js";
import { errorText } from "../shared/errors.js";
import { Chip } from "./chip.js";
import { AgentDefaultsEditor, Section } from "./agent-defaults.js";
import { inputStyle } from "./styles.js";
import { TabBar, type Tab } from "./tab-bar.js";

type Theme = PluginSurfaceProps["theme"];

type ConfigTab = "basic" | "planning" | "coding" | "prompts";
const CONFIG_TABS: readonly Tab<ConfigTab>[] = [
  { id: "basic", label: "Basic" },
  { id: "planning", label: "Planning" },
  { id: "coding", label: "Coding" },
  { id: "prompts", label: "Prompts" },
];

const MERGE_MODE_LABELS: Record<(typeof DEFAULT_MERGE_MODES)[number], string> = {
  pr: "Open a PR",
  local: "Merge locally",
  ask: "Ask each time",
};
const SIMPLIFY_LABELS: Record<(typeof SIMPLIFY_MODES)[number], string> = {
  required: "Always required",
  "not-required": "Never required",
  auto: "Auto",
  smart: "Smart (thresholds below)",
};
const PLANNING_TIER_LABELS: Record<(typeof PLANNING_TIERS)[number], string> = {
  auto: "Auto",
  "always-full": "Always full",
};
const REVIEWER_POLICY_LABELS: Record<(typeof REVIEWER_POLICIES)[number], string> = {
  tiered: "Tiered",
  "always-opus": "Always Opus",
};
/** Shared by `worktreeCleanup` and `branchDeletion`, which take the same three values. */
const ALWAYS_NEVER_ASK_LABELS: Record<(typeof WORKTREE_CLEANUP_MODES | typeof BRANCH_DELETION_MODES)[number], string> = {
  always: "Always",
  never: "Never",
  ask: "Ask each time",
};

/** Only meaningful when `simplify: "smart"`; the server accepts them regardless but ignores them otherwise. */
const SMART_SIMPLIFY_FIELDS = [
  { key: "smartSimplifyMaxPerPass", label: "Max judgment passes", min: 0 },
  { key: "smartSimplifyMinFixForwards", label: "Min fix-forwards", min: 1 },
  { key: "smartSimplifyMinNewFiles", label: "Min new files", min: 1 },
  { key: "smartSimplifyMinChangedLines", label: "Min changed lines", min: 1 },
  { key: "smartSimplifyMinGateRetries", label: "Min gate retries", min: 1 },
] as const satisfies readonly { key: keyof WorkflowConfig; label: string; min: number }[];

/** Workspace tab: the settings page pinned to the workspace's own project. */
export function ConfigWorkspacePanel({ workspaceId, theme }: PluginWorkspacePanelProps) {
  const root = useWorkspace(workspaceId, (workspace) => workspace.projectRootPath);
  const muted = { color: theme.colors.foregroundMuted };
  if (!root) return <Text style={{ padding: 16, ...muted }}>Loading workspace…</Text>;
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.colors.surface0 }}>
      <ConfigPanel theme={theme} root={root} />
    </View>
  );
}

/** `root` comes from the workspace and is never persisted; the server re-validates it. */
export function ConfigPanel({ theme, root: activeRoot }: { theme: Theme; root: string }) {
  const queryClient = useQueryClient();
  const fetchConfig = useRpc(getConfigRpc);
  const saveConfig = useRpc(setConfigRpc);
  const fetchProviders = useRpc(listProvidersRpc);

  const [tab, setTab] = useState<ConfigTab>("basic");

  const configKey = ["zekoder", "config", activeRoot];
  const config = useQuery({
    queryKey: configKey,
    queryFn: () => fetchConfig({ root: activeRoot }),
  });

  const [form, setForm] = useState<WorkflowConfig | null>(null);
  const loadedRoot = useRef<string | null>(null);
  useEffect(() => {
    if (!config.data || loadedRoot.current === activeRoot) return;
    loadedRoot.current = activeRoot;
    setForm(config.data.workflow);
  }, [config.data, activeRoot]);

  const save = useMutation({
    mutationFn: (input: {
      workflow?: WorkflowPatch;
      agentDefaults?: AgentDefaultsPatch;
    }) =>
      saveConfig({ root: activeRoot, ...input }),
    onSuccess: (data: ConfigStatus) => {
      queryClient.setQueryData(configKey, data);
      setForm(data.workflow);
    },
  });

  const muted = { color: theme.colors.foregroundMuted };
  const unset = new Set(config.data?.unset ?? []);
  const agentDefaults = config.data?.agentDefaults;

  const providersQuery = useQuery({
    queryKey: ["zekoder", "providers", activeRoot],
    queryFn: () => fetchProviders({ root: activeRoot }),
    staleTime: 60_000,
  });
  const providers = providersQuery.data?.providers ?? [];

  return (
    <ScrollView contentContainerStyle={{ gap: 20 }}>
      {config.isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(config.error)}</Text>}
      {save.isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(save.error)}</Text>}

      {form && (
        <>
          <TabBar<ConfigTab> theme={theme} compact={false} flush tabs={CONFIG_TABS} selected={tab} onSelect={setTab} />

          {tab === "basic" && (
            <>
              <Section theme={theme} title="Default branch">
                <BranchField
                  theme={theme}
                  value={form.defaultBranch}
                  isUnset={unset.has("defaultBranch")}
                  saving={save.isPending}
                  onSubmit={(value) => save.mutate({ workflow: { defaultBranch: value } })}
                />
              </Section>

              <Section theme={theme} title="Merge">
                {renderRadio("defaultMergeMode", "Default merge mode", DEFAULT_MERGE_MODES, MERGE_MODE_LABELS)}
                {renderRadio("worktreeCleanup", "Worktree cleanup", WORKTREE_CLEANUP_MODES, ALWAYS_NEVER_ASK_LABELS)}
                {renderRadio("branchDeletion", "Branch deletion", BRANCH_DELETION_MODES, ALWAYS_NEVER_ASK_LABELS)}
              </Section>
            </>
          )}

          {tab === "planning" && (
            <>
              <Section theme={theme} title="Planning">
                {renderRadio("planningTier", "Planning tier", PLANNING_TIERS, PLANNING_TIER_LABELS)}
                {renderRadio("reviewerPolicy", "Reviewer policy", REVIEWER_POLICIES, REVIEWER_POLICY_LABELS)}
                <NumberField
                  theme={theme}
                  label="Max packages per feature"
                  placeholder="Uncapped"
                  min={1}
                  value={form.maxPackagesPerFeature}
                  onSubmit={(value) => patchAndSave({ maxPackagesPerFeature: value })}
                />
              </Section>
              {renderAgentDefaults("planning")}
            </>
          )}

          {tab === "coding" && (
            <>
              <Section theme={theme} title="Simplify">
                {renderRadio("simplify", "Simplify mode", SIMPLIFY_MODES, SIMPLIFY_LABELS)}
                {form.simplify === "smart" &&
                  SMART_SIMPLIFY_FIELDS.map(({ key, label, min }) => (
                    <NumberField
                      key={key}
                      theme={theme}
                      label={label}
                      min={min}
                      value={form[key] as number | null}
                      onSubmit={(value) => patchAndSave({ [key]: value } as WorkflowPatch)}
                    />
                  ))}
              </Section>
              {renderAgentDefaults("coding")}
            </>
          )}

          {tab === "prompts" && (
            <Section theme={theme} title="Custom prompt">
              <TextInput
                multiline
                value={form.customPrompt ?? ""}
                onChangeText={(text) => setForm((current) => (current ? { ...current, customPrompt: text } : current))}
                onBlur={() => patchAndSave({ customPrompt: form.customPrompt?.trim() || null })}
                placeholder="Extra instructions appended to every planning/coding prompt"
                placeholderTextColor={theme.colors.foregroundMuted}
                style={{ ...inputStyle(theme), minHeight: 80, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8 }}
              />
            </Section>
          )}
        </>
      )}
    </ScrollView>
  );

  /** Repo-tier provider/model/effort/mode for the tab's session plus its role defaults. */
  function renderAgentDefaults(tab: "planning" | "coding") {
    if (!agentDefaults) return null;
    return (
      <AgentDefaultsEditor
        theme={theme}
        scope="repo"
        tabs={[tab]}
        showRoles
        state={agentDefaults}
        providers={providers}
        saving={save.isPending}
        error={providersQuery.data?.error ? `Provider list unavailable: ${providersQuery.data.error}` : null}
        onSave={(patch) => save.mutate({ agentDefaults: patch })}
      />
    );
  }

  /** One enum setting as a chip row; saves on pick and notes when the repo never set it. */
  function renderRadio<K extends RadioKey>(
    key: K,
    label: string,
    options: readonly WorkflowConfig[K][],
    labels: Record<WorkflowConfig[K], string>,
  ) {
    return (
      <RadioField
        theme={theme}
        label={label}
        hint={unset.has(key) ? "Not set — using default" : undefined}
        value={form![key]}
        options={options}
        labels={labels}
        onChange={(value) => patchAndSave({ [key]: value } as WorkflowPatch)}
      />
    );
  }

  function patchAndSave(patch: WorkflowPatch) {
    setForm((current) => (current ? { ...current, ...patch } : current));
    save.mutate({ workflow: patch });
  }
}

/** The workflow settings edited as a fixed set of choices. */
type RadioKey = "defaultMergeMode" | "worktreeCleanup" | "branchDeletion" | "planningTier" | "reviewerPolicy" | "simplify";

interface RadioFieldProps<T extends string> {
  theme: Theme;
  label: string;
  hint?: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange(value: T): void;
}

function RadioField<T extends string>({ theme, label, hint, value, options, labels, onChange }: RadioFieldProps<T>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.colors.foreground }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((option) => (
          <Chip
            key={option}
            theme={theme}
            label={labels[option]}
            selected={value === option}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
      {hint && <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{hint}</Text>}
    </View>
  );
}

interface NumberFieldProps {
  theme: Theme;
  label: string;
  value: number | null;
  min: number;
  placeholder?: string;
  onSubmit(value: number | null): void;
}

/** Uncontrolled-ish: keeps its own text while typing, only pushes a patch on blur. */
function NumberField({ theme, label, value, min, placeholder, onSubmit }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.colors.foreground }}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => {
          const trimmed = text.trim();
          if (trimmed === "") return onSubmit(null);
          const parsed = Math.max(min, Math.trunc(Number(trimmed)));
          if (Number.isNaN(parsed)) return setText(value === null ? "" : String(value));
          setText(String(parsed));
          onSubmit(parsed);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        keyboardType="numeric"
        style={{ ...inputStyle(theme), width: 120 }}
      />
    </View>
  );
}

/** Keeps its own text while typing; saves only on Save/Clear and never claims a save before the
 *  server accepts it (the form value updates from the re-read config on success). */
function BranchField({
  theme,
  value,
  isUnset,
  saving,
  onSubmit,
}: {
  theme: Theme;
  value: string | null;
  isUnset: boolean;
  saving: boolean;
  onSubmit(value: string | null): void;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const trimmed = text.trim();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: theme.colors.foreground }}>Default branch</Text>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
        {value === null || isUnset
          ? "Not set — auto-detecting (origin/HEAD, then main/master)."
          : `Set to ${value}.`}{" "}
        Future plans and batches land on this branch.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Auto-detect"
        placeholderTextColor={theme.colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ ...inputStyle(theme), width: 240 }}
      />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip
          theme={theme}
          label="Save"
          selected={false}
          onPress={() => trimmed !== "" && trimmed !== (value ?? "") && !saving && onSubmit(trimmed)}
        />
        {value !== null && (
          <Chip theme={theme} label="Clear (auto-detect)" selected={false} onPress={() => !saving && onSubmit(null)} />
        )}
      </View>
    </View>
  );
}
