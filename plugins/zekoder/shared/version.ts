import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Client poll for status. Cheap: the daemon answers from memory and checks upstream on its own schedule. */
export const VERSION_POLL_MS = 60_000;

/** Release channels in the zekoder release manifest the user can pick. */
export const RELEASE_CHANNELS = ["stable", "dev"] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

/** `stable` falls back to `dev` while stable has no release; `dev` never falls back. */
export const versionSettingsSchema = z.object({
  channel: z.enum(RELEASE_CHANNELS).default("stable"),
});
export const versionSettings = defineSettings({
  id: "zekoder-version-settings",
  scope: "host",
  version: 1,
  schema: versionSettingsSchema,
});

export const UPDATE_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

/** One background `scripts/install.sh <dir>` run. Runs go one at a time, since they share the zekoder-skills cache. */
export const updateJobSchema = z.object({
  status: z.enum(UPDATE_STATUSES),
  /** The zekoder version this run installs; null when the latest version was not known yet. */
  version: z.string().nullable(),
  log: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type UpdateJob = z.infer<typeof updateJobSchema>;

/** One directory the plugin keeps zekoder installed in: a project root or one of its workspace worktrees. */
export const targetVersionSchema = z.object({
  dir: z.string(),
  /** `packages.zekoder.version` from the directory's `.zekoder/config.json`; null when never installed. */
  installed: z.string().nullable(),
  /** True when `installed` is behind the latest version, or missing. */
  outdated: z.boolean(),
  job: updateJobSchema.nullable(),
});
export type TargetVersion = z.infer<typeof targetVersionSchema>;

export const projectVersionSchema = targetVersionSchema.extend({
  id: z.string(),
  name: z.string(),
  root: z.string(),
  /** Open workspaces whose directory is not the project root (git worktrees). */
  worktrees: z.array(targetVersionSchema),
});
export type ProjectVersion = z.infer<typeof projectVersionSchema>;

export const versionStatusSchema = z.object({
  /** Latest release version on `source` in the release manifest, as of the last check. */
  latest: z.string().nullable(),
  /** The channel the user picked. */
  channel: z.enum(RELEASE_CHANNELS),
  /** The channel `latest` came from: differs from `channel` when stable has no release yet. */
  source: z.enum(RELEASE_CHANNELS).nullable(),
  checkedAt: z.string().nullable(),
  checking: z.boolean(),
  error: z.string().nullable(),
  intervalMinutes: z.number(),
  projects: z.array(projectVersionSchema),
});
export type VersionStatus = z.infer<typeof versionStatusSchema>;

export const versionStatusRpc = defineRpc({
  name: "zekoder.version.status",
  input: z.object({}),
  output: versionStatusSchema,
});

/** Runs the latest-version check now (and the installs it leads to) instead of waiting for the next one. */
export const checkVersionRpc = defineRpc({
  name: "zekoder.version.check",
  input: z.object({}),
  output: versionStatusSchema,
});

/** Queues `scripts/install.sh <dir>` now, even after a failed run. `dir` is a project root or one of its worktrees. */
export const updateProjectRpc = defineRpc({
  name: "zekoder.version.update",
  input: z.object({ root: z.string() }),
  output: versionStatusSchema,
});
