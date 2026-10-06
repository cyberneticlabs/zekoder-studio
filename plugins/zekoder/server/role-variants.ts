import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PluginHookContext, PluginLifecycleEvents } from "@getpaseo/plugin/server";
import { AGENT_ROLES, isModelFamily, type AgentSource, type RoleFields } from "../shared/config.js";
import { errorText } from "../shared/errors.js";

/** Exactly the materializer's role-default file name; never a canonical agent or a feature-017 profile variant. */
const VARIANT_FILE = new RegExp(`^(?:${AGENT_ROLES.join("|")})--role-default-[0-9a-f]{8}\\.md$`);
const MATERIALIZE_TIMEOUT_MS = 30_000;
const run = promisify(execFile);

/** The resolver is missing or too old; a launch with a family set must always fail on this. */
export class ResolverMissingError extends Error {
  constructor(value: string, source: string) {
    super(`Model ${value} (from ${source}): Needs a newer zekoder-skills (no --resolve-model).`);
    this.name = "ResolverMissingError";
  }
}

/** Asks zekoder-skills for the newest native model ID of a family. Never picks a version itself. */
export async function resolveModelFamily(root: string, provider: string, family: string, source: string): Promise<string> {
  const script = join(root, ".zekoder-execution-profiles", "materialize-execution-profile.mjs");
  if (!existsSync(script)) throw new ResolverMissingError(family, source);
  let stdout: string;
  try {
    ({ stdout } = await run("node", [script, "--resolve-model", provider, family], { cwd: root, timeout: MATERIALIZE_TIMEOUT_MS }));
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    if (stderr?.includes("unknown flag: --resolve-model")) throw new ResolverMissingError(family, source);
    throw new Error(stderr || errorText(err));
  }
  const id = stdout.trim();
  if (!id || id === family) throw new Error(`the resolver returned ${id ? "the bare family" : "no model"}`);
  return id;
}

/**
 * Claude Code loads `.claude/agents/` only at session start, so a role-default variant a run
 * writes mid-session is "not found" and the run stops. Writing the same variants before the
 * session starts lets the run find them: the file name is a hash of role + binding, so the run's
 * own materialize call rewrites the identical file. Only roles with a model or effort set are
 * written; an effort-only role passes `inherit` as the model. Only `<role>--role-default-<hash>.md` files
 * are written — the canonical agents are never touched.
 */
export async function materializeRoleDefaults(
  root: string,
  provider: string,
  bindings: Record<string, RoleFields>,
  sources?: Record<string, { model?: AgentSource }>,
): Promise<void> {
  const toolDir = join(root, ".zekoder-execution-profiles");
  const script = join(toolDir, "materialize-execution-profile.mjs");

  // Each role writes its own file, so the spawns run in parallel.
  await Promise.all(AGENT_ROLES.filter((role) => bindings[role]?.model || bindings[role]?.effort).map(async (role) => {
    const binding = bindings[role] ?? {};
    // A family is resolved first, so the variant file name hashes the same ID skills hashes in-session.
    const model = isModelFamily(provider, binding.model)
      ? await resolveModelFamily(root, provider, binding.model as string, sources?.[role]?.model ?? "machine")
      : (binding.model ?? "inherit");
    const source = join(toolDir, "agents", `${role}.md`);
    if (!existsSync(script) || !existsSync(source)) {
      throw new Error(`Role default for ${role} is set, but ${toolDir} is missing — re-run the zekoder install (Zekoder page → Version tab).`);
    }
    const args = [script, provider, source, role, "role-default", root, model];
    if (binding.effort) args.push("--effort", binding.effort);
    let stdout: string;
    try {
      ({ stdout } = await run("node", args, { cwd: root, timeout: MATERIALIZE_TIMEOUT_MS }));
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr?.trim();
      throw new Error(`Could not prepare the ${role} role-default agent: ${stderr || errorText(err)}`);
    }
    const written = stdout.trim();
    if (!written.startsWith(".claude/agents/") || !VARIANT_FILE.test(written.slice(".claude/agents/".length))) {
      throw new Error(`Unexpected materializer output for ${role}: ${written || "(empty)"}`);
    }
  }));
}

/**
 * On archive, deletes the workspace directory's role-default variants — regular files only, so the
 * symlinked canonical agents can never match. Skipped while another open workspace shares the
 * directory, since its sessions may still spawn them. A later run rewrites them on demand.
 * Never throws: a failed cleanup must not fail the archive.
 */
export async function cleanupRoleVariants(
  { workspace }: PluginLifecycleEvents["workspace.archived"],
  { paseo }: PluginHookContext,
): Promise<void> {
  try {
    const agentsDir = join(workspace.cwd, ".claude", "agents");
    if (!existsSync(agentsDir)) return;
    const { entries } = await paseo.workspaces.list({ filter: { projectId: workspace.projectId }, page: { limit: 200 } });
    const shared = entries.some(
      (entry) => entry.id !== workspace.id && !entry.archivingAt && entry.workspaceDirectory === workspace.cwd,
    );
    if (shared) return;
    for (const name of await readdir(agentsDir)) {
      if (!VARIANT_FILE.test(name)) continue;
      const path = join(agentsDir, name);
      if ((await lstat(path)).isFile()) await unlink(path);
    }
  } catch (err) {
    console.warn(`[zekoder] role-variant cleanup skipped for ${workspace.cwd}:`, err);
  }
}
