import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const worktreeSchema = z.object({
  path: z.string(),
  /** Branch name; null for a detached HEAD or a bare entry. */
  branch: z.string().nullable(),
  sha: z.string(),
  /** The checkout this workspace runs in. */
  current: z.boolean(),
  /** First worktree `git worktree list` reports: the repository's own checkout. */
  main: z.boolean(),
  locked: z.boolean(),
  prunable: z.boolean(),
});
export type GitWorktree = z.infer<typeof worktreeSchema>;

export const branchSchema = z.object({
  /** Short name: `main`, or `origin/main` for a remote branch. */
  name: z.string(),
  remote: z.boolean(),
  current: z.boolean(),
  sha: z.string(),
  upstream: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  /** Committer date, unix seconds. */
  date: z.number(),
  subject: z.string(),
});
export type GitBranch = z.infer<typeof branchSchema>;

/** One commit row plus the lane geometry to draw its slice of the graph. */
export const commitSchema = z.object({
  sha: z.string(),
  parents: z.array(z.string()),
  author: z.string(),
  /** Author date, unix seconds. */
  date: z.number(),
  subject: z.string(),
  /** Decorations as `git log --decorate` prints them (`HEAD -> main`, `origin/main`, `tag: v1`). */
  refs: z.array(z.string()),
  /** Lane the commit dot sits in. */
  lane: z.number(),
  /** Lanes with a line in the row's top half (entering from the newer row). */
  top: z.array(z.number()),
  /** Lanes with a line in the row's bottom half (leaving toward the older row). */
  bottom: z.array(z.number()),
  /** Lanes joined to `lane` by a horizontal line at mid-row (merges in, and forks out). */
  links: z.array(z.number()),
});
export type GitCommit = z.infer<typeof commitSchema>;

export const HISTORY_SCOPES = ["current", "all"] as const;
export type HistoryScope = (typeof HISTORY_SCOPES)[number];

export const gitOverviewRpc = defineRpc({
  name: "zekoder.git.overview",
  input: z.object({
    /** The workspace's own checkout (`PluginWorkspaceSnapshot.directory`). */
    directory: z.string(),
    /** `current`: HEAD's history only; `all`: every local branch plus HEAD. */
    scope: z.enum(HISTORY_SCOPES),
    limit: z.number().int().min(1).max(1000),
  }),
  output: z.object({
    worktrees: z.array(worktreeSchema),
    branches: z.array(branchSchema),
    commits: z.array(commitSchema),
    /** True when the log was cut at `limit`. */
    more: z.boolean(),
  }),
});
