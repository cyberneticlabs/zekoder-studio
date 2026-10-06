import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { errorText } from "../shared/errors.js";
import { isModelFamily, isStrictField, type AgentDefaultsState, type AgentTab, type ConfigStatus } from "../shared/config.js";
import { canImplement, canPromote, skillPrompt } from "../shared/issues.js";
import type {
  implementIssueRpc,
  LaunchResult,
  ZekoderField,
  ZekoderIssue,
  ZekoderPackage,
  ZekoderProject,
  ZekoderRelation,
  getIssueRpc,
  listIssuesRpc,
  listProjectsRpc,
  migrateWorkspaceRpc,
  promoteIdeaRpc,
  readDocRpc,
} from "../shared/issues.js";
import { listWorktrees } from "./git.js";
import { McpStdioClient, type McpServerCommand } from "./mcp-client.js";
import { materializeRoleDefaults, ResolverMissingError, resolveModelFamily } from "./role-variants.js";

/**
 * Unpacked zekoder-skills release that `scripts/install.sh` installs from. `ZEKODER_CACHE_DIR`
 * overrides it; `SKILLS_CACHE_DIR` is a deprecated fallback.
 */
export const ZEKODER_CACHE_DIR =
  process.env.ZEKODER_CACHE_DIR || process.env.SKILLS_CACHE_DIR || join(homedir(), ".cache/zekoder-skills");
/** The cached zekoder-mcp bundle. */
export const DEFAULT_BUNDLE = join(ZEKODER_CACHE_DIR, "mcp/dist/zekoder-mcp.mjs");
const IDLE_SHUTDOWN_MS = 10 * 60_000;
const LIST_LIMIT = 500;
const SEARCH_LIMIT = 50;

/** Every non-terminal executable status, plus zekoder-mcp's `"open"` shorthand; decisions add `proposed`, ideas add `captured`. */
const OPEN_STATUS_FILTER = ["planned", "in-progress", "ready", "pr-open", "open", "proposed", "captured"];
const OPEN_STATUSES = new Set(OPEN_STATUS_FILTER);
/** Maps each UI status tab to the zekoder-mcp status values to query for; `"done"`/`"all"` fetch everything and filter client-side. */
const STATUS_FILTER_MAP: Record<import("../shared/issues.js").StatusFilter, string[] | undefined> = {
  open: OPEN_STATUS_FILTER,
  planned: ["planned"],
  "in-progress": ["in-progress"],
  done: undefined,
  all: undefined,
};
/** Keys the detail view renders in its header or its own section, not in the generic field list. */
const HEADER_KEYS = new Set(["id", "title", "name", "type", "status", "path", "packages", "contracts"]);

type PooledClient = { client: McpStdioClient; idleTimer: ReturnType<typeof setTimeout> };
const clients = new Map<string, PooledClient>();

export async function listProjects(
  _input: RpcInput<typeof listProjectsRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof listProjectsRpc>> {
  return { projects: await zekoderProjects(paseo) };
}

export async function listIssues(
  input: RpcInput<typeof listIssuesRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof listIssuesRpc>> {
  await assertZekoderProject(paseo, input.root);

  const query = input.query?.trim();
  const filter = {
    itemTypes: input.itemTypes?.length ? input.itemTypes : undefined,
    status: STATUS_FILTER_MAP[input.status],
    cwd: input.root,
  };
  const payload = (await callTool(
    input.root,
    query ? "zekoder_search" : "zekoder_list_items",
    query
      ? { ...filter, query, limit: SEARCH_LIMIT }
      : { ...filter, view: "summary", limit: LIST_LIMIT },
  )) as ToolPayload;

  let issues = (payload.results ?? payload.items ?? []).map(toIssue);
  let total = payload.total ?? payload.count ?? issues.length;
  if (input.status === "done") {
    issues = issues.filter((issue) => !OPEN_STATUSES.has(issue.status));
    total = issues.length;
  }
  return { issues, total, warnings: payload.warnings ?? [] };
}

export async function getIssue(
  input: RpcInput<typeof getIssueRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof getIssueRpc>> {
  await assertZekoderProject(paseo, input.root);
  const { item, docs } = await getItem(input.root, input.id, input.type);
  const { fields, relations } = splitMetadata(item);
  if (Array.isArray(item.contracts) && item.contracts.length > 0) {
    fields.push({ key: "contracts", value: String(item.contracts.length) });
  }
  const packages = Array.isArray(item.packages) ? item.packages.map(toPackage) : [];
  return {
    issue: {
      ...toIssue({ type: input.type, ...item }),
      fields,
      relations,
      packages,
      docs: (docs ?? []).map((doc) => doc.path),
    },
  };
}

/**
 * Opens (or reuses) the project's Paseo workspace and starts an agent there on the coding binding
 * (provider, model, effort, mode), with the implement skill and `{id}` as its first prompt. The
 * item's status is re-read here, so a stale UI can't start a second run on an item already in progress.
 */
export async function implementIssue(
  input: RpcInput<typeof implementIssueRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof implementIssueRpc>> {
  await assertZekoderProject(paseo, input.root);
  const { item } = await getItem(input.root, input.id, input.type);
  const status = statusOf(item);
  if (!canImplement(input.type, status)) {
    throw new Error(`Only a planned feature, bug or followup can be implemented (${input.id} is ${status || "unknown"}).`);
  }
  return startAgent(paseo, input.root, `Implement ${input.id}`, "zekoder-implement", input.id, "coding", { workspaceId: input.workspaceId });
}

/**
 * Starts an agent in the project's workspace on the planning binding, with the promote skill and
 * `{id}` as its first prompt; the agent asks for the target type in chat. The idea's status is
 * re-read here, so a stale UI can't promote an idea that is no longer `captured`.
 */
export async function promoteIdea(
  input: RpcInput<typeof promoteIdeaRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof promoteIdeaRpc>> {
  await assertZekoderProject(paseo, input.root);
  const status = statusOf((await getItem(input.root, input.id, "idea")).item);
  if (!canPromote("idea", status)) {
    throw new Error(`Only a captured idea can be promoted (${input.id} is ${status || "unknown"}).`);
  }
  return startAgent(paseo, input.root, `Promote ${input.id}`, "zekoder-promote", input.id, "planning", { workspaceId: input.workspaceId });
}

/**
 * Starts an agent in the project's workspace with the migrate skill. Provider and mode come from the
 * planning binding; model and effort from the migrate role. Every field is soft, so a drifted workspace (e.g. a resolver too old for model families) still migrates.
 */
export async function migrateWorkspace(
  input: RpcInput<typeof migrateWorkspaceRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof migrateWorkspaceRpc>> {
  await assertZekoderProject(paseo, input.root);
  return startAgent(paseo, input.root, "Migrate zekoder workspace", "zekoder-migrate", undefined, "planning", {
    allSoft: true,
    role: "zekoder-migrate-agent",
    workspaceId: input.workspaceId,
  });
}

/** Provider used when the bundle predates agent defaults (`supported` is false). Old-bundle path only. */
const LEGACY_PROVIDER = "claude";

type Paseo = PluginHandlerContext["paseo"];
type Launch = { provider: string; model: string; effort?: string; mode?: string };

/**
 * Resolves the tab's provider, model, effort and mode. A field from the same or a higher tier than
 * the provider is strict (a miss throws, naming its tier); a lower-tier field is soft (a miss falls
 * back to the provider's default). `allSoft` makes every field soft, and a missing resolver too.
 * `role` lets that role's own model and effort win over the tab's (the tab still gives provider and mode).
 */
async function resolveLaunch(
  paseo: Paseo,
  root: string,
  { values, sources, supported }: AgentDefaultsState,
  tab: AgentTab,
  { allSoft, role }: { allSoft: boolean; role?: string },
): Promise<{ status: "needs-onboarding"; tab: AgentTab } | ({ status: "resolved" } & Launch)> {
  const tabValues = values[tab] ?? {};
  const provider = tabValues.provider ?? (supported ? undefined : LEGACY_PROVIDER);
  if (!provider) return { status: "needs-onboarding", tab };
  const providerSource = sources[tab]?.provider ?? "machine";
  const roleValues = (role && values.roles?.[provider]?.[role]) || {};
  const roleSources = (role && sources.roles?.[provider]?.[role]) || {};
  // A role field that is unset or "inherit" leaves the tab's value in charge.
  const fromRole = (field: "model" | "effort") => !!roleValues[field] && roleValues[field] !== "inherit";
  const wanted = {
    ...tabValues,
    ...(fromRole("model") ? { model: roleValues.model } : {}),
    ...(fromRole("effort") ? { effort: roleValues.effort } : {}),
  };
  const sourceOf = (field: keyof typeof wanted) =>
    (field === "model" || field === "effort") && fromRole(field)
      ? (roleSources[field] ?? providerSource)
      : (sources[tab]?.[field] ?? providerSource);
  const strict = (field: keyof typeof wanted) => !allSoft && isStrictField(sourceOf(field), providerSource);

  const { models, error } = await paseo.providers.listModels(provider, { cwd: root });
  const selectable = (models ?? []).filter((entry) => entry.isSelectable !== false);
  const providerDefault = selectable.find((entry) => entry.isDefault) ?? selectable[0];

  let model = providerDefault;
  if (wanted.model && wanted.model !== "inherit") {
    const modelSource = sourceOf("model");
    let wantedId: string | undefined = wanted.model;
    let missReason = "";
    if (isModelFamily(provider, wanted.model)) {
      // ResolverMissingError fails the launch at any tier, unless every field is soft.
      try {
        wantedId = await resolveModelFamily(root, provider, wanted.model, modelSource);
      } catch (err) {
        if (err instanceof ResolverMissingError && !allSoft) throw err;
        wantedId = undefined;
        missReason = errorText(err);
      }
    }
    const match = wantedId ? selectable.find((entry) => entry.id === wantedId) : undefined;
    if (match) model = match;
    else if (strict("model")) {
      throw new Error(
        isModelFamily(provider, wanted.model)
          ? `Model ${wanted.model} (from ${modelSource}) could not be used for ${provider}: ${wantedId ? `${wantedId} is not listed by Paseo` : missReason}.`
          : `Model ${wanted.model} (from ${modelSource}) is not available for ${provider}.`,
      );
    }
  }
  if (!model) throw new Error(error || `No ${provider} model available on this host.`);

  let effort: string | undefined;
  if (wanted.effort) {
    if (model.thinkingOptions?.some((option) => option.id === wanted.effort)) effort = wanted.effort;
    else if (strict("effort")) {
      throw new Error(`Effort ${wanted.effort} (from ${sourceOf("effort")}) is not offered by ${model.id}.`);
    }
  }

  let mode: string | undefined;
  if (wanted.mode) {
    const listed = await paseo.providers.listModes(provider, { cwd: root });
    if (listed.modes?.some((entry) => entry.id === wanted.mode)) mode = wanted.mode;
    else if (strict("mode")) {
      throw new Error(`Mode ${wanted.mode} (from ${sourceOf("mode")}) is not available for ${provider}.`);
    }
  }
  return { status: "resolved", provider, model: model.id, effort, mode };
}

/** Opens (or reuses) the project's workspace and starts the agent there on the tab's resolved binding. */
async function startAgent(
  paseo: Paseo,
  root: string,
  title: string,
  skill: string,
  arg: string | undefined,
  tab: AgentTab,
  { allSoft = false, role, workspaceId }: { allSoft?: boolean; role?: string; workspaceId?: string } = {},
): Promise<LaunchResult> {
  const { agentDefaults } = await fetchConfig(root);
  const launch = await resolveLaunch(paseo, root, agentDefaults, tab, { allSoft, role });
  if (launch.status === "needs-onboarding") return launch;

  // Claude Code loads agents only at session start, so its role variants must exist beforehand.
  if (launch.provider === "claude") {
    await materializeRoleDefaults(root, launch.provider, agentDefaults.values.roles?.[launch.provider] ?? {}, agentDefaults.sources.roles?.[launch.provider]);
  }

  // The workspace the user clicked from (it may be a worktree); the project root only as a fallback.
  const workspace = workspaceId ? paseo.workspaces.ref(workspaceId) : await paseo.workspaces.open(root);
  const agent = await workspace.agents.create({
    config: {
      provider: `${launch.provider}/${launch.model}`,
      ...(launch.effort ? { thinkingOptionId: launch.effort } : {}),
      ...(launch.mode ? { modeId: launch.mode } : {}),
    },
    title,
    prompt: skillPrompt(launch.provider, skill, arg),
  });
  return { status: "started", agentId: agent.id, workspaceId: workspace.id };
}

/** The only place the machine-scope capability flag name lives (`payload.capabilities`). */
export const MACHINE_SCOPE_FLAG = "machineScopeRead";

const EMPTY_AGENT_DEFAULTS: AgentDefaultsState = {
  supported: false,
  machineScope: false,
  values: {},
  sources: {},
  roster: { providers: [], roles: [] },
  activeProfile: null,
  warnings: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Maps a raw `zekoder_get_config` payload to the plugin's agent-defaults state. Support is detected
 * by `sources.agentDefaults` (always present on zekoder-mcp 023+). The roster comes from
 * `roleDefaults.available` on every bundle; the legacy stored role values are never read.
 */
export function toAgentDefaultsState(payload: unknown): AgentDefaultsState {
  const raw = asRecord(payload) ?? {};
  const available = asRecord(asRecord(raw.roleDefaults)?.available);
  const roster = { providers: stringList(available?.harnesses), roles: stringList(available?.roles) };
  const sources = asRecord(asRecord(raw.sources)?.agentDefaults);
  if (!sources) return { ...EMPTY_AGENT_DEFAULTS, roster };
  const active = asRecord(raw.executionProfiles)?.active;
  const activeName = typeof active === "string" ? active : asRecord(active)?.name;
  return {
    supported: true,
    machineScope: asRecord(raw.capabilities)?.[MACHINE_SCOPE_FLAG] === true,
    values: (asRecord(raw.agentDefaults) ?? {}) as AgentDefaultsState["values"],
    sources: sources as AgentDefaultsState["sources"],
    roster,
    activeProfile: typeof activeName === "string" ? activeName : null,
    warnings: stringList(raw.warnings),
  };
}

/** The repo's resolved config, as the settings panel and the launch code read it. */
export async function fetchConfig(root: string): Promise<ConfigStatus> {
  const payload = (await callTool(root, "zekoder_get_config", { cwd: root })) as ConfigStatus;
  return {
    configured: payload.configured,
    workflow: payload.workflow,
    unset: payload.unset,
    agentDefaults: toAgentDefaultsState(payload),
  };
}

async function getItem(root: string, id: string, itemType: string) {
  const payload = (await callTool(root, "zekoder_get_item", { id, itemType, cwd: root })) as {
    item?: Record<string, unknown>;
    docs?: { path: string }[];
  };
  if (!payload.item) throw new Error(`zekoder item not found: ${id}`);
  return { item: payload.item, docs: payload.docs };
}

function statusOf(item: Record<string, unknown>): string {
  return typeof item.status === "string" ? item.status : "";
}

/**
 * Projection reads are plain file reads; the path must stay inside the checkout's `.zekoder/`.
 * The item registry is shared by every worktree of the repo, but a doc file lives only on the branch
 * that wrote it (an unmerged plan or ADR), so a miss in the project root falls back to its other worktrees.
 */
export async function readDoc(
  input: RpcInput<typeof readDocRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof readDocRpc>> {
  await assertZekoderProject(paseo, input.root);
  // Not a git repo, or git failed: the project root alone is searched.
  const worktrees = await listWorktrees(input.root).catch(() => []);
  const checkouts = [input.root, ...worktrees.filter((worktree) => !worktree.prunable).map((worktree) => worktree.path)];
  for (const checkout of new Set(checkouts)) {
    const content = await readDocIn(checkout, input.path);
    if (content !== null) return { path: input.path, content };
  }
  throw new Error(`${input.path} is not on disk in this project or any of its worktrees. Its branch may not be checked out.`);
}

/** The doc's text, or null when the checkout has no such file. Throws when the path escapes `.zekoder/`. */
async function readDocIn(checkout: string, path: string): Promise<string | null> {
  let workspace: string;
  let file: string;
  try {
    workspace = await realpath(resolve(checkout, ".zekoder"));
    file = await realpath(resolve(checkout, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!file.startsWith(workspace + sep) || !file.endsWith(".md")) {
    throw new Error(`Not a .zekoder/ markdown document: ${path}`);
  }
  return readFile(file, "utf8");
}

export function disposeClients(): void {
  for (const { client, idleTimer } of clients.values()) {
    clearTimeout(idleTimer);
    client.dispose();
  }
  clients.clear();
}

/** Stops one project's pooled zekoder-mcp process; the next call starts a fresh one. */
export function disposeClient(root: string): void {
  const pooled = clients.get(root);
  if (!pooled) return;
  clearTimeout(pooled.idleTimer);
  pooled.client.dispose();
  clients.delete(root);
}

type ToolPayload = {
  items?: Record<string, unknown>[];
  results?: Record<string, unknown>[];
  total?: number;
  count?: number;
  warnings?: string[];
};

function toIssue(raw: Record<string, unknown>): ZekoderIssue {
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : undefined);
  return {
    id: text("id") ?? "",
    type: text("type") ?? "",
    title: text("title") ?? text("name") ?? "(untitled)",
    status: text("status") ?? "",
    path: text("path") ?? "",
    severity: text("severity"),
    snippet: text("snippet"),
    score: typeof raw.score === "number" ? raw.score : undefined,
  };
}

function toPackage(raw: Record<string, unknown>): ZekoderPackage {
  const { fields, relations } = splitMetadata(raw);
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    status: String(raw.status ?? ""),
    fields,
    relations,
  };
}

/** Scalars become fields, string arrays become relations (empty ones dropped), anything else is skipped. */
function splitMetadata(raw: Record<string, unknown>) {
  const fields: ZekoderField[] = [];
  const relations: ZekoderRelation[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (HEADER_KEYS.has(key) || value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0 && value.every((entry) => typeof entry === "string")) {
        relations.push({ key, ids: value });
      }
    } else if (typeof value !== "object") {
      fields.push({ key, value: String(value) });
    }
  }
  return { fields, relations };
}

export async function assertZekoderProject(paseo: PluginHandlerContext["paseo"], root: string) {
  const projects = await zekoderProjects(paseo);
  if (!projects.some((project) => project.root === root)) {
    throw new Error(`Not a Paseo project with a .zekoder/ workspace: ${root}`);
  }
}

export async function zekoderProjects(paseo: PluginHandlerContext["paseo"]): Promise<ZekoderProject[]> {
  const { projects } = await paseo.projects.list();
  const seen = new Set<string>();
  const result: ZekoderProject[] = [];
  for (const project of projects) {
    const root = project.projectRootPath;
    if (seen.has(root) || !existsSync(join(root, ".zekoder"))) continue;
    seen.add(root);
    result.push({
      id: project.projectId,
      name: project.projectCustomName || project.projectDisplayName,
      root,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** One zekoder-mcp process per project root, shut down after a quiet spell. Throws on an `ok: false` envelope. */
export async function callTool(root: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  let pooled = clients.get(root);
  if (!pooled) {
    pooled = { client: new McpStdioClient(resolveServer(root)), idleTimer: setTimeout(() => {}) };
    clients.set(root, pooled);
  }
  clearTimeout(pooled.idleTimer);
  pooled.idleTimer = setTimeout(() => {
    pooled.client.dispose();
    clients.delete(root);
  }, IDLE_SHUTDOWN_MS);
  const payload = (await pooled.client.callTool(name, args)) as { ok?: boolean; error?: { message?: string } } | null;
  if (payload?.ok === false) throw new Error(payload.error?.message ?? `${name} failed`);
  return payload;
}

/**
 * Launch zekoder-mcp exactly as the project's own agents do: its `.mcp.json` `zekoder` entry
 * (written by the zekoder-skills installer). Falls back to `ZEKODER_MCP_BUNDLE`, then the shared cache.
 */
function resolveServer(root: string): McpServerCommand {
  const configured = readMcpJsonEntry(root, "zekoder");
  if (configured) return { ...configured, cwd: root };

  const bundle = process.env.ZEKODER_MCP_BUNDLE || DEFAULT_BUNDLE;
  if (!existsSync(bundle)) {
    throw new Error(
      `No zekoder MCP server for ${root} yet. The plugin installs zekoder there automatically — see Zekoder → Version for progress, or set ZEKODER_MCP_BUNDLE.`,
    );
  }
  return { command: "node", args: [bundle], cwd: root };
}

/** The project's `.mcp.json` entry for one MCP server (`zekoder`, `zekoder-org-health`), if usable. */
export function readMcpJsonEntry(root: string, server: string): Omit<McpServerCommand, "cwd"> | null {
  const file = join(root, ".mcp.json");
  if (!existsSync(file)) return null;
  try {
    const entry = JSON.parse(readFileSync(file, "utf8"))?.mcpServers?.[server];
    if (typeof entry?.command !== "string") return null;
    return {
      command: entry.command,
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
      env: entry.env && typeof entry.env === "object" ? entry.env : undefined,
    };
  } catch {
    return null;
  }
}
