import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPORT_DAYS_ERROR, assertOrgName, reportDaysSchema } from "../shared/reports.js";
import type { codingHealthRpc, collectReportRpc, listOrgsRpc, openReportRpc, validateOrgRpc } from "../shared/reports.js";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { errorText } from "../shared/errors.js";
import { readReport, runCollect, runOrgs, runReport } from "./org-health-cli.js";
import { ensureReportServer } from "./report-server.js";

const run = promisify(execFile);
const GH_TIMEOUT_MS = 20_000;

/** `gh api orgs/{org}` 404s for a missing org, a user account, or an org this login can't see. */
export async function validateOrg(input: RpcInput<typeof validateOrgRpc>): Promise<RpcOutput<typeof validateOrgRpc>> {
  const org = assertOrgName(input.org);
  try {
    const { stdout } = await run("gh", ["api", `orgs/${org}`], {
      timeout: GH_TIMEOUT_MS,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    });
    const body = JSON.parse(stdout) as { login?: string; name?: string | null };
    if (!body.login) throw new Error("unexpected response from GitHub");
    return { login: body.login, name: body.name ?? null };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    if (err.code === "ENOENT") throw new Error("The gh CLI is not installed on the Paseo host.");
    const detail = `${err.stdout ?? ""} ${err.stderr ?? ""}`;
    if (/HTTP 404|Not Found/i.test(detail)) {
      throw new Error(`GitHub org "${org}" does not exist, or the gh login on the Paseo host can't access it.`);
    }
    if (/auth login|HTTP 401/i.test(detail)) {
      throw new Error("gh is not logged in on the Paseo host. Run `gh auth login` there.");
    }
    throw new Error(`Could not check org "${org}": ${(err.stderr || err.message || String(error)).trim()}`);
  }
}

/** First-time collects in flight, by org, and the last failure not yet shown to the page. */
const collects = new Map<string, Promise<void>>();
const collectErrors = new Map<string, string>();

/**
 * Starts a background `collect` for an org with nothing in the central store yet. It runs detached
 * from the RPC (a first run can take minutes); the page polls while `collecting` is true.
 */
function startCollect(org: string, days: number): void {
  const job = runCollect(org, days)
    .catch((error) => void collectErrors.set(org, errorText(error)))
    .finally(() => collects.delete(org));
  collects.set(org, job);
}

/** Fetches the window's missing days. `started` is false when a collect for the org is already running. */
export async function collectReport(
  input: RpcInput<typeof collectReportRpc>,
): Promise<RpcOutput<typeof collectReportRpc>> {
  const org = assertOrgName(input.org);
  if (collects.has(org)) return { started: false };
  collectErrors.delete(org);
  startCollect(org, input.days);
  return { started: true };
}

/**
 * Runs `zekoder-org-health report` (cache only, never fetches) against the central store, then
 * reads the `<org>.json` it wrote. Only an org the store has never seen gets a background collect
 * automatically; for a known org with a partial window the page offers a button (`collectReport`).
 */
export async function getCodingHealth(
  input: RpcInput<typeof codingHealthRpc>,
): Promise<RpcOutput<typeof codingHealthRpc>> {
  const collectError = collectErrors.get(input.org) ?? null;
  // A failure is shown once, then cleared, so the next Reload retries instead of polling forever.
  collectErrors.delete(input.org);
  if (!collects.has(input.org) && collectError === null && !(await runOrgs()).includes(input.org)) {
    startCollect(input.org, input.days);
  }
  // Read before the report: a collect finishing mid-report still gets one more poll for fresh data.
  const collecting = collects.has(input.org);
  const files = await runReport(input.org, input.days);
  return {
    report: await readReport(files.json),
    files: { json: files.json, html: files.html },
    collecting,
    collectError,
  };
}

export async function listOrgs(): Promise<RpcOutput<typeof listOrgsRpc>> {
  return { orgs: await runOrgs() };
}

/** Starts the local report service and returns the tokenised URL of the org's web report. */
export async function openReport(input: RpcInput<typeof openReportRpc>): Promise<RpcOutput<typeof openReportRpc>> {
  const org = assertOrgName(input.org);
  if (!reportDaysSchema.safeParse(input.days).success) throw new Error(REPORT_DAYS_ERROR);
  const { port, token } = await ensureReportServer();
  return { url: `http://127.0.0.1:${port}/report/${org}?days=${input.days}&token=${token}` };
}
