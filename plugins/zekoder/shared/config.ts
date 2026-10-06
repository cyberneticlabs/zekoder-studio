import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_MERGE_MODES = ["pr", "local", "ask"] as const;
export const SIMPLIFY_MODES = ["required", "not-required", "auto", "smart"] as const;
export const PLANNING_TIERS = ["auto", "always-full"] as const;
export const REVIEWER_POLICIES = ["tiered", "always-opus"] as const;
export const WORKTREE_CLEANUP_MODES = ["always", "never", "ask"] as const;
export const BRANCH_DELETION_MODES = ["always", "never", "ask"] as const;

/** A nullable int field: `null` means "unset, use the fallback" — sent back as `null`, not omitted. */
const nullableInt = (min: number) => z.number().int().min(min).nullable();

/** Fully resolved workflow config — fallbacks already applied by zekoder-mcp. */
export const workflowConfigSchema = z.object({
  maxPackagesPerFeature: nullableInt(1),
  defaultMergeMode: z.enum(DEFAULT_MERGE_MODES),
  simplify: z.enum(SIMPLIFY_MODES),
  planningTier: z.enum(PLANNING_TIERS),
  reviewerPolicy: z.enum(REVIEWER_POLICIES),
  worktreeCleanup: z.enum(WORKTREE_CLEANUP_MODES),
  branchDeletion: z.enum(BRANCH_DELETION_MODES),
  customPrompt: z.string().max(2000).nullable(),
  /** Branch plans/batches land on. `null` = auto-detect (origin/HEAD, then main/master). */
  defaultBranch: z.string().min(1).nullable(),
  smartSimplifyMaxPerPass: nullableInt(0),
  smartSimplifyMinFixForwards: nullableInt(1),
  smartSimplifyMinNewFiles: nullableInt(1),
  smartSimplifyMinChangedLines: nullableInt(1),
  smartSimplifyMinGateRetries: nullableInt(1),
});
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

/** A patch sent to `zekoder_set_config`: only the keys the user actually changed. */
export const workflowPatchSchema = workflowConfigSchema.partial();
export type WorkflowPatch = z.infer<typeof workflowPatchSchema>;


/** One native role binding: `model` is a native ID or the literal "inherit"; `effort` is optional. */
export const roleBindingSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1).optional(),
});
export type RoleBinding = z.infer<typeof roleBindingSchema>;

/** Built-in agent roles a role default can bind (zekoder-mcp's roster minus the file-less task roles below). */
export const AGENT_ROLES = [
  "zekoder-planner-first-time",
  "zekoder-planner-agent",
  "zekoder-plan-reviewer",
  "zekoder-plan-reviewer-light",
  "zekoder-supervisor-agent",
  "zekoder-coding-agent",
  "zekoder-debt-agent",
  "zekoder-decision-agent",
  "zekoder-bug-report-agent",
  "zekoder-migrate-agent",
  "zekoder-goals-agent",
] as const;

/** Built-in task roles spawned with no agent file, so only the host's spawn-time controls apply. */
const TASK_ROLES: ReadonlySet<string> = new Set(["discovery", "simplify"]);

/** The only model values Claude's Agent tool `model` parameter accepts (besides `inherit`). */
export const CLAUDE_TASK_MODELS = ["sonnet", "opus", "haiku", "fable"] as const;

/** Model family names per provider. A family is stored as given and resolved to a native ID at launch. */
export const MODEL_FAMILIES: Record<string, readonly string[]> = {
  claude: CLAUDE_TASK_MODELS,
  codex: ["sol", "astra", "luna", "terra"],
};

export function isModelFamily(provider: string, model: string | undefined): boolean {
  return model !== undefined && (MODEL_FAMILIES[provider]?.includes(model) ?? false);
}

/** The family a native model ID belongs to (Claude `claude-<family>-...`, Codex `...-<family>`), or null. */
export function familyOf(provider: string, modelId: string): string | null {
  const parts = modelId.toLowerCase().split("-");
  const families = MODEL_FAMILIES[provider] ?? [];
  if (provider === "claude") return parts[0] === "claude" ? (families.find((f) => f === parts[1]) ?? null) : null;
  if (provider === "codex") return families.find((f) => f === parts[parts.length - 1]) ?? null;
  return null;
}

/**
 * Which controls a harness can express for a role (zekoder's `role-defaults.md` native-controls
 * table). Agent roles take model and effort everywhere. Task roles: Claude's Agent tool takes a
 * model alias but no effort; Codex takes both; OMP and OpenCode take neither (only `inherit`). A
 * binding the host can't express stops the run, so it must never be saved. `models` = the closed
 * set of accepted model values, or null when any native ID is accepted.
 */
export function roleControls(
  harness: string,
  role: string,
): { model: boolean; effort: boolean; models: readonly string[] | null } {
  if (!TASK_ROLES.has(role) || harness === "codex") return { model: true, effort: true, models: null };
  if (harness === "claude") return { model: true, effort: false, models: CLAUDE_TASK_MODELS };
  return { model: false, effort: false, models: null };
}

/** The accepted model value `model` maps to (e.g. `claude-sonnet-5-5` → `sonnet`), or null. */
export function acceptedModelFor(harness: string, role: string, model: string): string | null {
  const allowed = roleControls(harness, role).models;
  if (!allowed) return model;
  const id = model.toLowerCase();
  return allowed.find((alias) => id === alias || id.includes(alias)) ?? null;
}

/** Why `binding` can't run for this harness/role, or null when it can. */
export function roleBindingProblem(harness: string, role: string, binding: RoleBinding): string | null {
  const controls = roleControls(harness, role);
  if (!controls.model && binding.model !== "inherit") return `${harness} can't set a model for ${role}; only inherit works.`;
  if (controls.models && binding.model !== "inherit" && !controls.models.includes(binding.model)) {
    return `${harness} takes only ${controls.models.join(", ")} or inherit for ${role}; ${binding.model} stops the run.`;
  }
  if (!controls.effort && binding.effort) return `${harness} can't set effort for ${role}; the run stops on it.`;
  return null;
}

export const AGENT_TABS = ["planning", "coding"] as const; // planning = Promote, coding = Implement
export type AgentTab = (typeof AGENT_TABS)[number];
/** Tiers, high to low. There is no factory tier: an absent field means the provider's/agent's own default. */
export const AGENT_SOURCES = ["profile", "repo", "machine"] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];

const tabDefaultsSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  mode: z.string().optional(),
});
const roleFieldsSchema = z.object({ model: z.string().optional(), effort: z.string().optional() });
/** Every field optional; strings stored as given (no family translation here). */
export type TabDefaults = z.infer<typeof tabDefaultsSchema>;
export type RoleFields = z.infer<typeof roleFieldsSchema>;
export const agentDefaultsSchema = z.object({
  planning: tabDefaultsSchema.optional(),
  coding: tabDefaultsSchema.optional(),
  roles: z.record(z.string(), z.record(z.string(), roleFieldsSchema)).optional(),
});
export type AgentDefaults = z.infer<typeof agentDefaultsSchema>;

const sourceSchema = z.enum(AGENT_SOURCES);
const tabSourcesSchema = z.object({
  provider: sourceSchema.optional(),
  model: sourceSchema.optional(),
  effort: sourceSchema.optional(),
  mode: sourceSchema.optional(),
});
const roleSourcesSchema = z.object({ model: sourceSchema.optional(), effort: sourceSchema.optional() });
/** Same tree as `AgentDefaults`; every leaf is the tier that supplied the value. */
export const agentDefaultsSourcesSchema = z.object({
  planning: tabSourcesSchema.optional(),
  coding: tabSourcesSchema.optional(),
  roles: z.record(z.string(), z.record(z.string(), roleSourcesSchema)).optional(),
});
export type AgentDefaultsSources = z.infer<typeof agentDefaultsSourcesSchema>;

export const agentDefaultsStateSchema = z.object({
  /** True when get_config has `sources.agentDefaults` (always added by zekoder-mcp 023). */
  supported: z.boolean(),
  /** MACHINE_SCOPE_FLAG (`capabilities.machineScopeRead`) is true. */
  machineScope: z.boolean(),
  /** Resolved per field by zekoder-mcp; absent = unset in every tier. */
  values: agentDefaultsSchema,
  sources: agentDefaultsSourcesSchema,
  roster: z.object({ providers: z.array(z.string()), roles: z.array(z.string()) }),
  /** Read-only, display only. */
  activeProfile: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type AgentDefaultsState = z.infer<typeof agentDefaultsStateSchema>;

/**
 * One patch per save. Dotted field paths: "planning.provider|model|effort|mode", "coding.<same>",
 * "roles.<provider>.<role>.model|effort". `set` and `clear` may not overlap at any level (a prefix
 * counts), so clear leaf paths only.
 */
export const agentDefaultsPatchSchema = z.object({
  set: z.record(z.string(), z.string().min(1)).default({}),
  clear: z.array(z.string()).default([]),
});
export type AgentDefaultsPatch = z.infer<typeof agentDefaultsPatchSchema>;

/** Soft/strict rule. A field is strict when its tier is the same as, or higher than, the tier that
 *  set the provider. A soft field (from a lower tier) is used only if the provider offers it. */
export function isStrictField(fieldSource: AgentSource, providerSource: AgentSource): boolean {
  return AGENT_SOURCES.indexOf(fieldSource) <= AGENT_SOURCES.indexOf(providerSource);
}

export const configStatusSchema = z.object({
  configured: z.boolean(),
  workflow: workflowConfigSchema,
  /** Keys currently on their fallback value, i.e. never explicitly set for this repo. */
  unset: z.array(z.string()),
  agentDefaults: agentDefaultsStateSchema,
});
export type ConfigStatus = z.infer<typeof configStatusSchema>;

/** One selectable model of a harness, as Paseo reports it; `efforts` are that model's thinking levels. */
export const harnessModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  isDefault: z.boolean().optional(),
  efforts: z.array(z.object({ id: z.string(), label: z.string(), isDefault: z.boolean().optional() })),
});
export type HarnessModel = z.infer<typeof harnessModelSchema>;

/** Live model list for one harness on this host. `error` set + empty `models` = the UI falls back to free text. */
export const listHarnessModelsRpc = defineRpc({
  name: "zekoder.config.models",
  input: z.object({ root: z.string(), harness: z.string() }),
  output: z.object({ models: z.array(harnessModelSchema), error: z.string().nullable() }),
});

/** One available provider: Paseo enabled + ready (callers also intersect with `roster.providers`). */
const providerOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  models: z.array(harnessModelSchema),
  modes: z.array(z.object({ id: z.string(), label: z.string() })),
  defaultModeId: z.string().nullable(),
});
export type ProviderOption = z.infer<typeof providerOptionSchema>;

/** Ready providers for a project, with their models and access modes. `error` set = empty list. */
export const listProvidersRpc = defineRpc({
  name: "zekoder.config.providers",
  input: z.object({ root: z.string().optional() }),
  output: z.object({ providers: z.array(providerOptionSchema), error: z.string().nullable() }),
});

export const getConfigRpc = defineRpc({
  name: "zekoder.config.get",
  input: z.object({ root: z.string() }),
  output: configStatusSchema,
});

/** Shallow-merged onto the stored config by zekoder-mcp; only send the keys that changed. */
export const setConfigRpc = defineRpc({
  name: "zekoder.config.set",
  input: z.object({
    root: z.string(),
    workflow: workflowPatchSchema.optional(),
    /** Repo-tier agent defaults; the server sends it with `scope: "repo"`. */
    agentDefaults: agentDefaultsPatchSchema.optional(),
  }),
  output: configStatusSchema,
});

/** The machine tier's defaults, read and written through the zekoder-mcp of one transport project. */
const machineDefaultsOutputSchema = z.object({
  state: agentDefaultsStateSchema.nullable(),
  /** The project root whose zekoder-mcp carried the call; `null` when no Zekoder project exists. */
  transportRoot: z.string().nullable(),
  error: z.string().nullable(),
});

/** `root` is a preferred transport project (e.g. the launch's repo); the server falls back to any Zekoder project. */
export const getMachineDefaultsRpc = defineRpc({
  name: "zekoder.defaults.get",
  input: z.object({ root: z.string().optional() }),
  output: machineDefaultsOutputSchema,
});

export const setMachineDefaultsRpc = defineRpc({
  name: "zekoder.defaults.set",
  input: z.object({ root: z.string().optional(), agentDefaults: agentDefaultsPatchSchema }),
  output: machineDefaultsOutputSchema,
});
