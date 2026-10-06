import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { AGENT_TABS } from "./config.js";

export const ITEM_TYPES = ["feature", "bug", "followup", "vendor-issues", "decision", "idea"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** UI-level status buckets. The server maps each onto zekoder-mcp status filters. */
export const STATUS_FILTERS = ["open", "planned", "in-progress", "done", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The issues tab's last-chosen project + filters, persisted across mount/unmount. */
export const issueFiltersSchema = z.object({
  root: z.string().nullable().default(null),
  status: z.enum(STATUS_FILTERS).default("open"),
  types: z.array(z.enum(ITEM_TYPES)).default([]),
});
export type IssueFilters = z.infer<typeof issueFiltersSchema>;
export const issueFiltersSettings = defineSettings({
  id: "zekoder-issues-filters",
  scope: "host",
  version: 1,
  schema: issueFiltersSchema,
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  root: z.string(),
});
export type ZekoderProject = z.infer<typeof projectSchema>;

export const listProjectsRpc = defineRpc({
  name: "zekoder.projects.list",
  input: z.object({}),
  output: z.object({ projects: z.array(projectSchema) }),
});

export const issueSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  status: z.string(),
  path: z.string(),
  severity: z.string().optional(),
  snippet: z.string().optional(),
  score: z.number().optional(),
});
export type ZekoderIssue = z.infer<typeof issueSchema>;

/** A label/value pair for metadata the UI renders generically, so new fields need no UI change. */
export const fieldSchema = z.object({ key: z.string(), value: z.string() });
export type ZekoderField = z.infer<typeof fieldSchema>;

export const relationSchema = z.object({ key: z.string(), ids: z.array(z.string()) });
export type ZekoderRelation = z.infer<typeof relationSchema>;

export const packageSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  fields: z.array(fieldSchema),
  relations: z.array(relationSchema),
});
export type ZekoderPackage = z.infer<typeof packageSchema>;

export const issueDetailSchema = issueSchema.extend({
  fields: z.array(fieldSchema),
  relations: z.array(relationSchema),
  packages: z.array(packageSchema),
  docs: z.array(z.string()),
});
export type ZekoderIssueDetail = z.infer<typeof issueDetailSchema>;

export const getIssueRpc = defineRpc({
  name: "zekoder.issues.get",
  input: z.object({ root: z.string(), id: z.string(), type: z.enum(ITEM_TYPES) }),
  output: z.object({ issue: issueDetailSchema }),
});

export const listIssuesRpc = defineRpc({
  name: "zekoder.issues.list",
  input: z.object({
    root: z.string(),
    query: z.string().optional(),
    itemTypes: z.array(z.enum(ITEM_TYPES)).optional(),
    status: z.enum(STATUS_FILTERS).default("open"),
  }),
  output: z.object({
    issues: z.array(issueSchema),
    total: z.number(),
    warnings: z.array(z.string()),
  }),
});

/** Reads one `.zekoder/` markdown doc (a projection path returned by `zekoder.issues.get`). */
export const readDocRpc = defineRpc({
  name: "zekoder.docs.read",
  input: z.object({ root: z.string(), path: z.string() }),
  output: z.object({ path: z.string(), content: z.string() }),
});

/** Item types the supervisor → coding-agent pipeline can execute; the rest are documentation only. */
export const EXECUTABLE_TYPES: readonly ItemType[] = ["feature", "bug", "followup"];

/** Codex invokes a skill as `$skill`; every other provider uses `/skill`. */
export function skillPrompt(provider: string, skill: string, arg?: string): string {
  return `${provider === "codex" ? "$" : "/"}${skill}${arg ? ` ${arg}` : ""}`;
}

/** Result of a launch RPC. `needs-onboarding`: a supported bundle resolved no provider for that tab. */
export const launchResultSchema = z.union([
  z.object({ status: z.literal("started"), agentId: z.string(), workspaceId: z.string() }),
  z.object({ status: z.literal("needs-onboarding"), tab: z.enum(AGENT_TABS) }),
]);
export type LaunchResult = z.infer<typeof launchResultSchema>;

/** Only a planned (committed, not yet started) executable item can be handed to `/zekoder-implement`. */
export function canImplement(type: string, status: string): boolean {
  return status === "planned" && (EXECUTABLE_TYPES as readonly string[]).includes(type);
}

/** The slash command that implements a plan item; the Copy button's text. */
export function implementCommand(id: string): string {
  return `/zekoder-implement ${id}`;
}

/** Starts an agent in the project's workspace running the implement skill on the coding binding. */
export const implementIssueRpc = defineRpc({
  name: "zekoder.issues.implement",
  input: z.object({ root: z.string(), id: z.string(), type: z.enum(ITEM_TYPES), workspaceId: z.string().optional() }),
  output: launchResultSchema,
});

/** Only a `captured` idea can be promoted; `/zekoder-promote` refuses every other status. */
export function canPromote(type: string, status: string): boolean {
  return type === "idea" && status === "captured";
}

/** Starts an agent in the project's workspace running the promote skill on the planning binding. */
export const promoteIdeaRpc = defineRpc({
  name: "zekoder.issues.promote",
  input: z.object({ root: z.string(), id: z.string(), workspaceId: z.string().optional() }),
  output: launchResultSchema,
});

/** The slash command that brings a workspace's `.zekoder/` schema up to the installed server's. */
export const MIGRATE_COMMAND = "/zekoder-migrate";

/** True for a zekoder-mcp warning whose fix is `/zekoder-migrate` (a pending schema migration). */
export function needsMigration(warning: string): boolean {
  return warning.includes(MIGRATE_COMMAND);
}

/** Starts an agent in the project's workspace running the migrate skill on the planning provider. */
export const migrateWorkspaceRpc = defineRpc({
  name: "zekoder.workspace.migrate",
  input: z.object({ root: z.string(), workspaceId: z.string().optional() }),
  output: launchResultSchema,
});
