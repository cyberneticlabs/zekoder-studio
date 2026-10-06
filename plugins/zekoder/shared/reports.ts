import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Same bounds as zekoder-org-health's `--days` (`DEFAULT_DAYS` / `MAX_DAYS` in its window.ts). */
export const DEFAULT_REPORT_DAYS = 60;
export const MAX_REPORT_DAYS = 365;

/** GitHub org login rule, as enforced by zekoder-org-health's run.ts. */
export const ORG_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** Trims `raw` and returns it when it is a valid org login; throws otherwise. */
export function assertOrgName(raw: string): string {
  const org = raw.trim();
  if (!ORG_NAME.test(org)) throw new Error(`Not a valid GitHub org name: ${JSON.stringify(org)}`);
  return org;
}

/** A report window length in days. */
export const reportDaysSchema = z.number().int().min(1).max(MAX_REPORT_DAYS);
export const REPORT_DAYS_ERROR = `Days must be a whole number from 1 to ${MAX_REPORT_DAYS}.`;

/** Report parameters. `org` is saved after `validateOrgRpc` confirms it, or picked from `listOrgsRpc`. */
export const reportSettingsSchema = z.object({
  org: z.string().nullable().default(null),
  days: reportDaysSchema.default(DEFAULT_REPORT_DAYS),
});
export type ReportSettings = z.infer<typeof reportSettingsSchema>;
export const reportSettings = defineSettings({
  id: "zekoder-report-settings",
  scope: "host",
  version: 1,
  schema: reportSettingsSchema,
});

/** Checks the org exists and the daemon's `gh` login can see it; returns the canonical login. */
export const validateOrgRpc = defineRpc({
  name: "zekoder.reports.validate-org",
  input: z.object({ org: z.string() }),
  output: z.object({ login: z.string(), name: z.string().nullable() }),
});

/** zekoder-org-health's `ReportPayload` (its report.ts), as written to `<org>.json`. */
export const codingHealthReportSchema = z.object({
  org: z.string(),
  window: z.object({ start: z.string(), end: z.string(), days: z.array(z.string()) }),
  generatedAt: z.string(),
  complete: z.boolean(),
  pendingCommitDetails: z.number(),
  users: z.array(z.object({ key: z.string(), label: z.string(), bot: z.boolean(), unlinked: z.boolean() })),
  repos: z.array(z.string()),
  /** `[dayIndex, repoIndex, userIndex, commits, additions, deletions]` */
  commits: z.array(z.array(z.number())),
  /** `[dayIndex, repoIndex, userIndex, merged, closedUnmerged, additions, deletions]` */
  pulls: z.array(z.array(z.number())),
});
export type CodingHealthReport = z.infer<typeof codingHealthReportSchema>;

/**
 * Rebuilds the report from the central org-health store and returns it. An org the store has never
 * seen gets a background GitHub collect first; `collecting` stays true until it finishes.
 */
export const codingHealthRpc = defineRpc({
  name: "zekoder.reports.coding-health",
  input: z.object({
    org: z.string(),
    days: reportDaysSchema,
  }),
  output: z.object({
    report: codingHealthReportSchema,
    files: z.object({ json: z.string(), html: z.string() }),
    /** A first-time background collect for this org is still running. */
    collecting: z.boolean(),
    /** The last background collect failed with this message (reported once). */
    collectError: z.string().nullable(),
  }),
});

/**
 * Starts a background GitHub collect for the days of the window the cache lacks (collect skips
 * cached days). Progress shows through `codingHealthRpc`'s `collecting`.
 */
export const collectReportRpc = defineRpc({
  name: "zekoder.reports.collect",
  input: z.object({
    org: z.string(),
    days: reportDaysSchema,
  }),
  output: z.object({ started: z.boolean() }),
});

/** Orgs present in the central org-health store. */
export const listOrgsRpc = defineRpc({
  name: "zekoder.reports.list-orgs",
  input: z.object({}),
  output: z.object({ orgs: z.array(z.string()) }),
});

/** Starts (or reuses) the local report service and returns the URL of the full web report. */
export const openReportRpc = defineRpc({
  name: "zekoder.reports.open",
  input: z.object({
    org: z.string(),
    days: reportDaysSchema,
  }),
  output: z.object({ url: z.string() }),
});
