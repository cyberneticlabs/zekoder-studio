import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  PluginBeforeRequests,
  PluginHandlerContext,
  PluginHookContext,
  PluginLifecycleEvents,
  PluginSettings,
} from "@getpaseo/plugin/server";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type {
  ReleaseChannel,
  TargetVersion,
  UpdateJob,
  VersionStatus,
  checkVersionRpc,
  updateProjectRpc,
  versionSettingsSchema,
  versionStatusRpc,
} from "../shared/version.js";
import { errorText } from "../shared/errors.js";
import { DEFAULT_BUNDLE, ZEKODER_CACHE_DIR, disposeClient } from "./zekoder.js";

const run = promisify(execFile);

type Paseo = PluginHandlerContext["paseo"];

/** Unpacked zekoder-skills release that `scripts/install.sh` installs from. */
const CACHE_DIR = ZEKODER_CACHE_DIR;
const INSTALL_SCRIPT = join(CACHE_DIR, "scripts/install.sh");
/** Where install.sh keeps each harness's install state, relative to the install directory. */
const HARNESS_STATE: Record<string, string> = {
  claude: ".zekoder/harness-install/claude/state.json",
  codex: ".zekoder/codex-install/state.json",
  omp: ".zekoder/harness-install/omp/state.json",
  opencode: ".zekoder/harness-install/opencode/state.json",
};
/** Written next to the unpacked release, so an unchanged release is not downloaded again. */
const RELEASE_MARKER = join(CACHE_DIR, ".zekoder-release.json");
const MANIFEST_URL =
  process.env.ZEKODER_RELEASE_MANIFEST || "https://storage.googleapis.com/zekoder-releases/releases/manifest.json";
const CHECK_INTERVAL_MS = 6 * 60 * 60_000;
const FIRST_CHECK_DELAY_MS = 10_000;
const MANIFEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const UNZIP_TIMEOUT_MS = 2 * 60_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
/** How long a new agent in a never-installed directory waits for its install before starting anyway. */
const AGENT_WAIT_MS = 2 * 60_000;
const LOG_TAIL_CHARS = 8000;
/** The daemon's maximum page size. */
const WORKSPACE_PAGE_LIMIT = 200;

/** One `channels.<name>.latest` entry of the release manifest. */
interface Release {
  version: string;
  zipUrl: string;
  sha256: string;
}

let latest: string | null = null;
/** The release `latest` names; what an install unpacks into the cache. */
let release: Release | null = null;
let channel: ReleaseChannel = "stable";
let source: ReleaseChannel | null = null;
let checkedAt: string | null = null;
let checkError: string | null = null;
let inFlight: Promise<void> | null = null;
/** The host API from the latest RPC or hook. Timers have no context of their own to get it from. */
let host: Paseo | null = null;
/** Keyed by install directory. */
const jobs = new Map<string, UpdateJob>();
const pending = new Map<string, Promise<void>>();
/** The user's channel choice, registered by the plugin entry. */
let settings: PluginSettings<typeof versionSettingsSchema> | null = null;
/** Every cache user (check, unpack, install.sh) runs here one at a time: an unpack replaces the cache. */
let cacheQueue: Promise<unknown> = Promise.resolve();

export async function versionStatus(
  _input: RpcInput<typeof versionStatusRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof versionStatusRpc>> {
  host = paseo;
  return buildStatus(await reconcile(paseo));
}

export async function checkVersion(
  _input: RpcInput<typeof checkVersionRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof checkVersionRpc>> {
  host = paseo;
  await checkLatest();
  return buildStatus(await reconcile(paseo));
}

export async function updateProject(
  input: RpcInput<typeof updateProjectRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof updateProjectRpc>> {
  host = paseo;
  const projects = await installTargets(paseo);
  const known = projects.some((project) => project.root === input.root || project.worktrees.includes(input.root));
  if (!known) throw new Error(`Not a Paseo project or workspace directory: ${input.root}`);
  enqueueInstall(input.root);
  return buildStatus(projects);
}

/** A new workspace (often a fresh git worktree, where every installed file is gitignored) gets its own install. */
export async function installForWorkspace(
  _event: PluginLifecycleEvents["workspace.created"],
  { paseo }: PluginHookContext,
): Promise<void> {
  host = paseo;
  try {
    await reconcile(paseo);
  } catch (error) {
    console.warn("[zekoder] install check after workspace.created failed:", error);
  }
}

/**
 * Before an agent starts in a project root or workspace directory with no zekoder at all, waits
 * (up to AGENT_WAIT_MS) for its install, so the session loads the skills and MCP server at start.
 * An outdated install is updated in the background instead. Never throws: the agent must start.
 */
export async function installBeforeAgent(
  { request }: { request: PluginBeforeRequests["agent.create"] },
  { paseo }: PluginHookContext,
): Promise<void> {
  host = paseo;
  try {
    if (latest === null) await checkLatest();
    await reconcile(paseo);
    const dir = resolve(request.config.cwd);
    const job = pending.get(dir);
    if (!job || installedVersion(dir) !== null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([job, new Promise((done) => (timer = setTimeout(done, AGENT_WAIT_MS)))]);
    clearTimeout(timer);
  } catch (error) {
    console.warn("[zekoder] install before agent.create failed:", error);
  }
}

/**
 * Checks now-ish, then every CHECK_INTERVAL_MS, installing wherever zekoder is missing or behind.
 * A channel change checks again at once. Returns the cleanup.
 */
export function scheduleVersionChecks(store: PluginSettings<typeof versionSettingsSchema>): () => void {
  settings = store;
  const tick = () =>
    void checkLatest().then(() => {
      if (host) reconcile(host).catch((error) => console.warn("[zekoder] scheduled install check failed:", error));
    });
  const first = setTimeout(tick, FIRST_CHECK_DELAY_MS);
  const interval = setInterval(tick, CHECK_INTERVAL_MS);
  first.unref?.();
  interval.unref?.();
  const unsubscribe = store.subscribe((state) => {
    if (state.status === "ready" && state.values.channel !== channel) tick();
  });
  return () => {
    clearTimeout(first);
    clearInterval(interval);
    unsubscribe();
  };
}

function inCacheQueue<T>(task: () => Promise<T>): Promise<T> {
  const result = cacheQueue.then(task);
  cacheQueue = result.catch(() => undefined);
  return result;
}

/** Reads the release manifest and picks the release for the user's channel. Downloads nothing. */
function checkLatest(): Promise<void> {
  inFlight ??= inCacheQueue(async () => {
    try {
      channel = await readChannel();
      const manifest = await fetchWithTimeout(MANIFEST_URL, MANIFEST_TIMEOUT_MS, (response) => response.json());
      const picked = pickRelease(manifest, channel);
      if (!picked) throw new Error(`release manifest has no ${channel === "stable" ? "stable or dev" : "dev"} release`);
      ({ release, source } = picked);
      latest = picked.release.version;
      checkError = null;
    } catch (error) {
      checkError = errorText(error);
    } finally {
      checkedAt = new Date().toISOString();
      inFlight = null;
    }
  });
  return inFlight;
}

/** GETs `url` and reads its body with `read`; the timeout covers the body too. */
async function fetchWithTimeout<T>(url: string, timeoutMs: number, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return await read(response);
  } finally {
    clearTimeout(timer);
  }
}

/** Stored channel; invalid or unreadable settings mean the default. */
async function readChannel(): Promise<ReleaseChannel> {
  try {
    const state = await settings?.read();
    return state?.status === "ready" ? state.values.channel : "stable";
  } catch {
    return "stable";
  }
}

/** `stable` uses `dev` while stable has no release. */
function pickRelease(manifest: unknown, wanted: ReleaseChannel): { release: Release; source: ReleaseChannel } | null {
  const order: ReleaseChannel[] = wanted === "stable" ? ["stable", "dev"] : ["dev"];
  for (const name of order) {
    const entry = (manifest as { channels?: Record<string, { latest?: unknown }> })?.channels?.[name]?.latest;
    if (isRelease(entry)) return { release: entry, source: name };
  }
  return null;
}

function isRelease(value: unknown): value is Release {
  const entry = value as Partial<Release> | null;
  return (
    typeof entry?.version === "string" &&
    typeof entry.zipUrl === "string" &&
    typeof entry.sha256 === "string" &&
    /^[0-9a-f]{64}$/i.test(entry.sha256)
  );
}

/**
 * Makes the cache hold `target`: downloads its zip, checks the sha256, unpacks it next to the
 * cache, then swaps it in. Skipped when the marker already names this exact build. Callers hold
 * the cache queue.
 */
async function ensureRelease(target: Release, log: (line: string) => void): Promise<void> {
  try {
    const marker = JSON.parse(await readFile(RELEASE_MARKER, "utf8"));
    if (marker?.sha256 === target.sha256 && !cacheMissing()) return;
  } catch {
    // No marker: a first run, or a cache from the old git installer. Replace it.
  }
  const staging = `${CACHE_DIR}.new-${randomBytes(4).toString("hex")}`;
  const zip = `${staging}.zip`;
  const old = `${CACHE_DIR}.old-${randomBytes(4).toString("hex")}`;
  try {
    log(`== downloading zekoder ${target.version} from ${target.zipUrl} ==\n`);
    await mkdir(dirname(CACHE_DIR), { recursive: true });
    const bytes = Buffer.from(await fetchWithTimeout(target.zipUrl, DOWNLOAD_TIMEOUT_MS, (response) => response.arrayBuffer()));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== target.sha256.toLowerCase()) {
      throw new Error(`sha256 mismatch: expected ${target.sha256}, got ${digest}`);
    }
    await writeFile(zip, bytes);
    await run("unzip", ["-q", zip, "-d", staging], { timeout: UNZIP_TIMEOUT_MS });
    if (!existsSync(join(staging, "scripts/install.sh"))) throw new Error("release zip has no scripts/install.sh");
    await writeFile(join(staging, ".zekoder-release.json"), JSON.stringify(target, null, 2) + "\n");
    const hadCache = existsSync(CACHE_DIR);
    if (hadCache) await rename(CACHE_DIR, old);
    try {
      await rename(staging, CACHE_DIR);
    } catch (error) {
      if (hadCache) await rename(old, CACHE_DIR);
      throw error;
    }
    await rm(old, { recursive: true, force: true });
    log(`== unpacked into ${CACHE_DIR} ==\n`);
  } catch (error) {
    throw new Error(`Could not update the zekoder-skills cache: ${errorText(error)}`);
  } finally {
    await Promise.all([zip, staging].map((path) => rm(path, { recursive: true, force: true })));
  }
}

type InstallProject = { id: string; name: string; root: string; worktrees: string[] };

/**
 * Every Paseo project root, plus each open workspace directory that is not its project's root.
 * The home directory and `/` are skipped: an install there would land in every repo below it.
 */
async function installTargets(paseo: Paseo): Promise<InstallProject[]> {
  const [{ projects }, entries] = await Promise.all([paseo.projects.list(), listAllWorkspaces(paseo)]);
  const skip = new Set([homedir(), "/"]);
  const byId = new Map<string, InstallProject>();
  const roots = new Set<string>();
  for (const project of projects) {
    const root = resolve(project.projectRootPath);
    if (roots.has(root) || skip.has(root) || !existsSync(root)) continue;
    roots.add(root);
    byId.set(project.projectId, {
      id: project.projectId,
      name: project.projectCustomName || project.projectDisplayName,
      root,
      worktrees: [],
    });
  }
  const seen = new Set(roots);
  for (const workspace of entries) {
    const project = byId.get(workspace.projectId);
    if (!project || workspace.archivingAt || !workspace.workspaceDirectory) continue;
    const dir = resolve(workspace.workspaceDirectory);
    if (seen.has(dir) || skip.has(dir) || !existsSync(dir)) continue;
    seen.add(dir);
    project.worktrees.push(dir);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function listAllWorkspaces(paseo: Paseo) {
  const entries = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({ page: { limit: WORKSPACE_PAGE_LIMIT, cursor } });
    entries.push(...page.entries);
    cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return entries;
}

/** Queues an install for every target that is missing zekoder or behind the latest version. */
async function reconcile(paseo: Paseo): Promise<InstallProject[]> {
  const projects = await installTargets(paseo);
  for (const dir of projects.flatMap((project) => [project.root, ...project.worktrees])) {
    if (wantsInstall(dir)) enqueueInstall(dir);
  }
  return projects;
}

/**
 * Only once the latest version is known (the install downloads from the same place). A failed
 * run for the same version is retried after one check interval, not on every poll.
 */
function wantsInstall(dir: string): boolean {
  if (latest === null || !needsInstall(dir)) return false;
  const job = jobs.get(dir);
  if (!job) return true;
  if (job.status === "queued" || job.status === "running") return false;
  if (job.version !== latest) return true;
  // The cache was wiped after a good run: every project's MCP bundle is gone, so heal now.
  if (job.status === "succeeded") return cacheMissing();
  return job.status === "failed" && Date.now() - Date.parse(job.finishedAt ?? job.startedAt) >= CHECK_INTERVAL_MS;
}

function enqueueInstall(dir: string): void {
  const current = jobs.get(dir);
  if (current?.status === "queued" || current?.status === "running") return;
  const job: UpdateJob = {
    status: "queued",
    version: latest,
    log: "",
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(dir, job);
  const done = inCacheQueue(() => runInstall(dir, job)).finally(() => pending.delete(dir));
  pending.set(dir, done);
}

async function runInstall(dir: string, job: UpdateJob): Promise<void> {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  const append = (chunk: Buffer | string) => {
    job.log = (job.log + chunk.toString()).slice(-LOG_TAIL_CHARS);
  };
  const finish = (ok: boolean, note?: string) => {
    if (note) append(`\n${note}\n`);
    job.status = ok ? "succeeded" : "failed";
    job.finishedAt = new Date().toISOString();
    // Our pooled zekoder-mcp process still runs the old bundle; the next call respawns it.
    if (ok) disposeClient(dir);
  };

  try {
    if (!release) throw new Error("The latest release is not known yet.");
    await ensureRelease(release, append);
  } catch (error) {
    finish(false, errorText(error));
    return;
  }
  const harnesses = installHarnesses(dir);
  const args = harnesses ? ["--harnesses", harnesses.join(","), dir] : [dir];
  await new Promise<void>((done) => {
    const child = spawn("bash", [INSTALL_SCRIPT, ...args], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill(), INSTALL_TIMEOUT_MS);
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(false, `failed to start: ${error.message}`);
      done();
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      finish(code === 0, code === 0 ? undefined : `exited (${signal ?? code})`);
      done();
    });
  });
}

/** Behind the latest version, a wiped cache, or a harness installed on disk that the config list dropped. */
function needsInstall(dir: string): boolean {
  if (isOutdated(installedVersion(dir)) || cacheMissing()) return true;
  const config = configHarnesses(dir);
  return config !== null && diskHarnesses(dir).some((harness) => !config.includes(harness));
}

/**
 * The config list plus every harness with install state on disk, so one never goes stale while
 * another updates. Null = neither exists; install.sh then uses its own defaults.
 */
function installHarnesses(dir: string): string[] | null {
  const config = configHarnesses(dir);
  const disk = diskHarnesses(dir);
  if (config === null && disk.length === 0) return null;
  return [...new Set([...(config ?? []), ...disk])].sort();
}

function diskHarnesses(dir: string): string[] {
  return Object.keys(HARNESS_STATE).filter((harness) => existsSync(join(dir, HARNESS_STATE[harness])));
}

/** `.zekoder/config.json` → `supportedHarnessAgents`, known names only (`coex` = codex). */
function configHarnesses(dir: string): string[] | null {
  const list = readConfig(dir)?.supportedHarnessAgents;
  if (!Array.isArray(list)) return null;
  const known = list.map((name) => (name === "coex" ? "codex" : name)).filter((name) => name in HARNESS_STATE);
  return known.length > 0 ? [...new Set(known)] : null;
}

function buildStatus(projects: InstallProject[]): VersionStatus {
  return {
    latest,
    channel,
    source,
    checkedAt,
    checking: inFlight !== null,
    error: checkError,
    intervalMinutes: CHECK_INTERVAL_MS / 60_000,
    projects: projects.map(({ id, name, root, worktrees }) => ({
      id,
      name,
      root,
      ...targetStatus(root),
      worktrees: worktrees.map(targetStatus),
    })),
  };
}

function targetStatus(dir: string): TargetVersion {
  const installed = installedVersion(dir);
  return { dir, installed, outdated: latest !== null && needsInstall(dir), job: jobs.get(dir) ?? null };
}

function isOutdated(installed: string | null): boolean {
  return latest !== null && (installed === null || semverLt(installed, latest));
}

/** The shared cache lost its installer or MCP bundle (for example, someone deleted ~/.cache). */
function cacheMissing(): boolean {
  return !existsSync(INSTALL_SCRIPT) || !existsSync(DEFAULT_BUNDLE);
}

/** The marker the zekoder-skills installer writes. */
function installedVersion(dir: string): string | null {
  const version = readConfig(dir)?.packages?.zekoder?.version;
  return typeof version === "string" ? version : null;
}

function readConfig(dir: string): any {
  try {
    return JSON.parse(readFileSync(join(dir, ".zekoder/config.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Semver order, prereleases included: `0.48.0-rc.1` < `0.48.0-rc.2` < `0.48.0`. */
function semverLt(a: string, b: string): boolean {
  const [coreA, preA] = splitVersion(a);
  const [coreB, preB] = splitVersion(b);
  for (let i = 0; i < Math.max(coreA.length, coreB.length); i++) {
    const diff = (coreA[i] ?? 0) - (coreB[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  if (preA.length === 0 || preB.length === 0) return preA.length > preB.length;
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    if (preA[i] === undefined) return true;
    if (preB[i] === undefined) return false;
    if (preA[i] === preB[i]) continue;
    const numA = /^\d+$/.test(preA[i]);
    const numB = /^\d+$/.test(preB[i]);
    if (numA && numB) return Number(preA[i]) < Number(preB[i]);
    if (numA !== numB) return numA;
    return preA[i] < preB[i];
  }
  return false;
}

function splitVersion(version: string): [number[], string[]] {
  const [core, ...rest] = version.replace(/\+.*$/, "").split("-");
  const pre = rest.join("-");
  return [core.split(".").map((part) => parseInt(part, 10) || 0), pre ? pre.split(".") : []];
}
