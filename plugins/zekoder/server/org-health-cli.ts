import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { assertOrgName, codingHealthReportSchema } from "../shared/reports.js";
import type { CodingHealthReport } from "../shared/reports.js";
import { DEFAULT_BUNDLE } from "./zekoder.js";

const run = promisify(execFile);
/** Report-only runs read the local SQLite store, no GitHub requests — this is generous. */
const REPORT_TIMEOUT_MS = 60_000;
/** Collect makes one GitHub request per commit, so a first 90-day run can take a long time. */
const COLLECT_TIMEOUT_MS = 60 * 60_000;
const VERSION_TIMEOUT_MS = 5_000;
const MAX_OUTPUT = 64 * 1024 * 1024;
const MIN_VERSION: [number, number, number] = [0, 34, 0];
const ORG_HEALTH_BUNDLE = join(dirname(DEFAULT_BUNDLE), "zekoder-org-health-mcp.mjs");
/** Run from home so a stray relative path never lands in a project checkout. */
const CLI_OPTIONS = { cwd: homedir(), env: process.env, timeout: REPORT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT };

/** Bundles already checked, keyed by `path + mtimeMs`, so an updated bundle is re-checked. */
const versionPassed = new Set<string>();

export interface ReportFiles {
  json: string;
  html: string;
}

/** `ZEKODER_MCP_HOME` or `~/.zekoder-mcp` — same rule as zekoder-mcp's `cacheHome()`. */
function cacheHome(): string {
  return process.env.ZEKODER_MCP_HOME || join(homedir(), ".zekoder-mcp");
}

function resolveOrgHealthCli(): string {
  const bundle = process.env.ZEKODER_ORG_HEALTH_BUNDLE || ORG_HEALTH_BUNDLE;
  if (!existsSync(bundle)) {
    throw new Error(
      `No zekoder-org-health bundle at ${bundle}: install zekoder (Zekoder page → Version tab) or set ZEKODER_ORG_HEALTH_BUNDLE.`,
    );
  }
  return bundle;
}

function tooOld(bundle: string): Error {
  return new Error(
    `The zekoder-org-health bundle at ${bundle} is too old — update zekoder to ≥ 0.34.0 (Zekoder page → Version tab).`,
  );
}

/** Older bundles write into the calling directory, so refuse to run them before any report/orgs call. */
async function assertBundleVersion(bundle: string): Promise<void> {
  const key = `${bundle}:${statSync(bundle).mtimeMs}`;
  if (versionPassed.has(key)) return;
  let version: [number, number, number];
  try {
    const { stdout } = await run("node", [bundle, "--version"], { timeout: VERSION_TIMEOUT_MS });
    // No match throws here too; the catch below turns every failure into `tooOld`.
    const [, major, minor, patch] = /(\d+)\.(\d+)\.(\d+)/.exec(stdout)!;
    version = [Number(major), Number(minor), Number(patch)];
  } catch {
    throw tooOld(bundle);
  }
  for (let i = 0; i < 3; i++) {
    if (version[i] > MIN_VERSION[i]) break;
    if (version[i] < MIN_VERSION[i]) throw tooOld(bundle);
  }
  versionPassed.add(key);
}

/** Runs `report --org --days` (cache only, never fetches) and returns the paths it wrote. */
export async function runReport(org: string, days: number): Promise<ReportFiles> {
  assertOrgName(org);
  const bundle = resolveOrgHealthCli();
  await assertBundleVersion(bundle);
  let stdout: string;
  try {
    ({ stdout } = await run("node", [bundle, "report", "--org", org, "--days", String(days)], CLI_OPTIONS));
  } catch (error) {
    // Exit code 2 = report written but partial (window not fully cached). Still a result.
    const err = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    if (err.code !== 2 || !err.stdout) {
      throw new Error(`zekoder-org-health report failed: ${(err.stderr || err.message || String(error)).trim()}`);
    }
    stdout = err.stdout;
  }
  const result = JSON.parse(stdout) as { files?: { db?: string; json?: string; html?: string } };
  if (!result.files?.json || !result.files.html) throw new Error("zekoder-org-health report returned no files");
  if (result.files.db !== join(cacheHome(), "org_health", "org-health.db")) throw tooOld(bundle);
  return { json: result.files.json, html: result.files.html };
}

/** Runs `collect --org --days` (fetches from GitHub via the host's `gh` login into the central store). */
export async function runCollect(org: string, days: number): Promise<void> {
  assertOrgName(org);
  const bundle = resolveOrgHealthCli();
  await assertBundleVersion(bundle);
  try {
    await run("node", [bundle, "collect", "--org", org, "--days", String(days)], {
      ...CLI_OPTIONS,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      timeout: COLLECT_TIMEOUT_MS,
    });
  } catch (error) {
    // Exit code 2 = collected but the window is still partial (e.g. empty repos). Still a result.
    const err = error as { code?: number | string; stderr?: string; message?: string };
    if (err.code === 2) return;
    // stderr carries progress lines too; the failure reason is the last one.
    const reason = (err.stderr || err.message || String(error)).trim().split("\n").at(-1);
    throw new Error(`zekoder-org-health collect failed: ${reason}`);
  }
}

export async function runOrgs(): Promise<string[]> {
  const bundle = resolveOrgHealthCli();
  await assertBundleVersion(bundle);
  try {
    const { stdout } = await run("node", [bundle, "orgs"], CLI_OPTIONS);
    const body = JSON.parse(stdout) as { orgs?: string[] };
    return body.orgs ?? [];
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(`zekoder-org-health orgs failed: ${(err.stderr || err.message || String(error)).trim()}`);
  }
}

export async function readReport(jsonPath: string): Promise<CodingHealthReport> {
  return codingHealthReportSchema.parse(JSON.parse(await readFile(jsonPath, "utf8")));
}
