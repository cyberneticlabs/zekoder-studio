import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import {
  roleBindingProblem,
  type AgentDefaultsPatch,
  type AgentDefaultsState,
  type HarnessModel,
  type getConfigRpc,
  type getMachineDefaultsRpc,
  type listHarnessModelsRpc,
  type listProvidersRpc,
  type setConfigRpc,
  type setMachineDefaultsRpc,
} from "../shared/config.js";
import { errorText } from "../shared/errors.js";
import { assertZekoderProject, callTool, fetchConfig, zekoderProjects } from "./zekoder.js";

type ProviderModel = {
  id: string;
  label: string;
  isDefault?: boolean;
  isSelectable?: boolean;
  thinkingOptions?: { id: string; label: string; isDefault?: boolean }[];
};

/** Paseo model definition to the plugin's `HarnessModel`. */
export function toHarnessModel(model: ProviderModel): HarnessModel {
  return {
    id: model.id,
    label: model.label,
    isDefault: model.isDefault,
    efforts: (model.thinkingOptions ?? []).map(({ id, label, isDefault }) => ({ id, label, isDefault })),
  };
}

export async function getConfig(
  input: RpcInput<typeof getConfigRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof getConfigRpc>> {
  await assertZekoderProject(paseo, input.root);
  return fetchConfig(input.root);
}

export async function listHarnessModels(
  input: RpcInput<typeof listHarnessModelsRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof listHarnessModelsRpc>> {
  await assertZekoderProject(paseo, input.root);
  try {
    const { models, error } = await paseo.providers.listModels(input.harness, { cwd: input.root });
    return {
      models: (models ?? []).filter((model) => model.isSelectable !== false).map(toHarnessModel),
      error: error ?? null,
    };
  } catch (err) {
    // An unknown or unavailable harness is a normal state (e.g. opencode not installed), not a failure.
    return { models: [], error: errorText(err) };
  }
}

/** Ready providers (Paseo enabled + ready) with their models and modes. Callers intersect with the roster. */
export async function listProviders(
  input: RpcInput<typeof listProvidersRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof listProvidersRpc>> {
  try {
    if (input.root !== undefined) await assertZekoderProject(paseo, input.root);
    const { entries } = await paseo.providers.snapshot({ cwd: input.root });
    return {
      providers: (entries ?? [])
        .filter((entry) => entry.enabled && entry.status === "ready")
        .map((entry) => ({
          id: entry.provider,
          label: entry.label ?? entry.provider,
          models: (entry.models ?? []).filter((model) => model.isSelectable !== false).map(toHarnessModel),
          modes: (entry.modes ?? []).map(({ id, label }) => ({ id, label })),
          defaultModeId: entry.defaultModeId ?? null,
        })),
      error: null,
    };
  } catch (err) {
    return { providers: [], error: errorText(err) };
  }
}

/**
 * Maps one editor patch to the `zekoder_set_config` args: `set` becomes a nested `agentDefaults`
 * object, `clear` becomes `agentDefaults.<path>` entries, both under `scope`.
 */
export function toSetConfigArgs(patch: AgentDefaultsPatch, scope: "repo" | "machine") {
  const agentDefaults: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(patch.set)) {
    const keys = path.split(".");
    let node = agentDefaults;
    for (const key of keys.slice(0, -1)) {
      node = (node[key] ??= {}) as Record<string, unknown>;
    }
    node[keys[keys.length - 1]!] = value;
  }
  return {
    scope,
    ...(Object.keys(patch.set).length > 0 ? { agentDefaults } : {}),
    ...(patch.clear.length > 0 ? { clear: patch.clear.map((path) => `agentDefaults.${path}`) } : {}),
  };
}

/** Role fields in a patch (`roles.<provider>.<role>.model|effort`) must be runnable on that provider/role. */
function agentDefaultsProblem(patch: AgentDefaultsPatch): string | null {
  const byRole = new Map<string, { provider: string; role: string; model?: string; effort?: string }>();
  for (const [path, value] of Object.entries(patch.set)) {
    const [head, provider, role, field] = path.split(".");
    if (head !== "roles" || !provider || !role || (field !== "model" && field !== "effort")) continue;
    const entry = byRole.get(`${provider}.${role}`) ?? { provider, role };
    entry[field] = value;
    byRole.set(`${provider}.${role}`, entry);
  }
  for (const { provider, role, model, effort } of byRole.values()) {
    // A model absent from this patch: check the effort alone (the stored model is not re-read here).
    const problem = roleBindingProblem(provider, role, { model: model ?? "inherit", ...(effort ? { effort } : {}) });
    if (problem && (model !== undefined || effort)) return problem;
  }
  return null;
}

export async function setConfig(
  input: RpcInput<typeof setConfigRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof setConfigRpc>> {
  await assertZekoderProject(paseo, input.root);
  const { agentDefaults } = input;
  let extra = {};
  if (agentDefaults) {
    if (!(await fetchConfig(input.root)).agentDefaults.supported) throw new Error("Needs a newer zekoder-mcp.");
    const problem = agentDefaultsProblem(agentDefaults);
    if (problem) throw new Error(problem);
    extra = toSetConfigArgs(agentDefaults, "repo");
  }
  await callTool(input.root, "zekoder_set_config", {
    workflow: input.workflow,
    ...extra,
    cwd: input.root,
  });
  // The tool returns a mutation envelope, not the config — read it back for the UI's next render.
  return fetchConfig(input.root);
}

type MachineOutput = RpcOutput<typeof getMachineDefaultsRpc>;
type Paseo = PluginHandlerContext["paseo"];

/**
 * Picks the project whose zekoder-mcp carries machine-tier calls: `root` first (when it is a Zekoder
 * project), then the others. Stops at the first whose plain read has the machine-scope capability;
 * with none, the first candidate and its plain state (disabled, so the tab shows the hint).
 */
async function machineTransportRoot(
  paseo: Paseo,
  root: string | undefined,
): Promise<{ root: string; plain: AgentDefaultsState } | { root: null; error: string | null }> {
  const projects = await zekoderProjects(paseo);
  const roots = projects.map((project) => project.root);
  const candidates = root && roots.includes(root) ? [root, ...roots.filter((r) => r !== root)] : roots;
  let first: { root: string; plain: AgentDefaultsState } | null = null;
  let error: string | null = null;
  for (const candidate of candidates) {
    try {
      const plain = (await fetchConfig(candidate)).agentDefaults;
      if (plain.supported && plain.machineScope) return { root: candidate, plain };
      first ??= { root: candidate, plain };
    } catch (err) {
      error ??= errorText(err);
    }
  }
  return first ?? { root: null, error };
}

/** One `machine` source leaf for every string leaf of `values` (same tree). */
function machineSources(values: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = "machine";
    else if (value !== null && typeof value === "object") out[key] = machineSources(value);
  }
  return out;
}

async function readMachineDefaults(paseo: Paseo, root: string | undefined): Promise<MachineOutput> {
  let transport;
  try {
    transport = await machineTransportRoot(paseo, root);
  } catch (err) {
    return { state: null, transportRoot: null, error: errorText(err) };
  }
  if (transport.root === null) return { state: null, transportRoot: null, error: transport.error };
  const { plain } = transport;
  if (!plain.supported || !plain.machineScope) return { state: plain, transportRoot: transport.root, error: null };
  try {
    // Loose parse: 050 and 022 payloads differ; only these three fields are read.
    const payload = (await callTool(transport.root, "zekoder_get_config", { cwd: transport.root, scope: "machine" })) as {
      agentDefaults?: AgentDefaultsState["values"] | null;
      warnings?: unknown;
    } | null;
    const values = payload?.agentDefaults ?? {};
    const warnings = Array.isArray(payload?.warnings)
      ? payload.warnings.filter((w): w is string => typeof w === "string")
      : [];
    return {
      state: {
        supported: true,
        machineScope: true,
        values,
        sources: machineSources(values) as AgentDefaultsState["sources"],
        roster: plain.roster,
        activeProfile: null,
        warnings: [...new Set([...plain.warnings, ...warnings])],
      },
      transportRoot: transport.root,
      error: null,
    };
  } catch (err) {
    return { state: plain, transportRoot: transport.root, error: errorText(err) };
  }
}

export async function getMachineDefaults(
  input: RpcInput<typeof getMachineDefaultsRpc>,
  { paseo }: PluginHandlerContext,
): Promise<MachineOutput> {
  return readMachineDefaults(paseo, input.root);
}

export async function setMachineDefaults(
  input: RpcInput<typeof setMachineDefaultsRpc>,
  { paseo }: PluginHandlerContext,
): Promise<MachineOutput> {
  const transport = await machineTransportRoot(paseo, input.root);
  if (transport.root === null) throw new Error("Open a Zekoder project in Paseo first.");
  if (!transport.plain.supported || !transport.plain.machineScope) throw new Error("Needs a newer zekoder-mcp.");
  const problem = agentDefaultsProblem(input.agentDefaults);
  if (problem) throw new Error(problem);
  await callTool(transport.root, "zekoder_set_config", {
    ...toSetConfigArgs(input.agentDefaults, "machine"),
    cwd: transport.root,
  });
  return readMachineDefaults(paseo, transport.root);
}
