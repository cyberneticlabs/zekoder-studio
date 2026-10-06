import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { agentBranchRpc } from "../shared/branch.js";

const run = promisify(execFile);
const GIT_TIMEOUT_MS = 5_000;

/** True when `cwd` or any parent holds `.zekoder/` — a worktree carries its own committed copy. */
function inZekoderProject(cwd: string): boolean {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".zekoder"))) return true;
    if (dirname(dir) === dir) return false;
  }
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["-C", cwd, ...args], { timeout: GIT_TIMEOUT_MS });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function agentBranch(
  input: RpcInput<typeof agentBranchRpc>,
): Promise<RpcOutput<typeof agentBranchRpc>> {
  if (!inZekoderProject(input.cwd)) return { zekoder: false, branch: null };
  const head = await git(input.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head !== "HEAD") return { zekoder: true, branch: head };
  const sha = await git(input.cwd, ["rev-parse", "--short", "HEAD"]);
  return { zekoder: true, branch: sha ? `detached @ ${sha}` : null };
}
