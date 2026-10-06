import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { promisify } from "node:util";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { GitBranch, GitCommit, GitWorktree, gitOverviewRpc } from "../shared/git.js";

const run = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 16 * 1024 * 1024;
/** Field separator for `--format` output: never appears in names or subjects. */
const SEP = "\x1f";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", cwd, ...args], { timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  return stdout;
}

/** Absolute, symlink-free common git dir, shared by a repository and all its worktrees; null outside git. */
async function commonDir(dir: string): Promise<string | null> {
  try {
    const out = (await git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    return realpathSync(out);
  } catch {
    return null;
  }
}

/** The client's directory is a hint: accept it only when it is a checkout of a known Paseo project. */
async function assertProjectCheckout(paseo: PluginHandlerContext["paseo"], directory: string) {
  const own = await commonDir(directory);
  if (own) {
    const { projects } = await paseo.projects.list();
    const roots = [...new Set(projects.map((project) => project.projectRootPath))];
    for (const root of roots) if ((await commonDir(root)) === own) return;
  }
  throw new Error(`Not a git checkout of a Paseo project: ${directory}`);
}

export async function gitOverview(
  input: RpcInput<typeof gitOverviewRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof gitOverviewRpc>> {
  await assertProjectCheckout(paseo, input.directory);
  const [worktrees, branches, log] = await Promise.all([
    listWorktrees(input.directory),
    listBranches(input.directory),
    readLog(input.directory, input.scope, input.limit),
  ]);
  return { worktrees, branches, ...log };
}

export async function listWorktrees(directory: string): Promise<GitWorktree[]> {
  const here = realpathSync(directory);
  const out = await git(directory, ["worktree", "list", "--porcelain"]);
  return out
    .split("\n\n")
    .filter((block) => block.trim())
    .map((block, index) => {
      const lines = block.split("\n");
      const value = (key: string) =>
        lines.find((line) => line === key || line.startsWith(`${key} `))?.slice(key.length + 1);
      const path = value("worktree") ?? "";
      const branch = value("branch");
      let current = false;
      try {
        current = realpathSync(path) === here;
      } catch {
        // A prunable worktree's folder is gone; it can't be the current one.
      }
      return {
        path,
        branch: branch ? branch.replace(/^refs\/heads\//, "") : null,
        sha: (value("HEAD") ?? "").slice(0, 7),
        current,
        main: index === 0,
        locked: value("locked") !== undefined,
        prunable: value("prunable") !== undefined,
      };
    });
}

async function listBranches(directory: string): Promise<GitBranch[]> {
  const format = [
    "%(refname)",
    "%(refname:short)",
    "%(HEAD)",
    "%(objectname:short)",
    "%(upstream:short)",
    "%(upstream:track,nobracket)",
    "%(committerdate:unix)",
    "%(contents:subject)",
  ].join(SEP);
  const out = await git(directory, ["for-each-ref", "--sort=-committerdate", `--format=${format}`, "refs/heads", "refs/remotes"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(SEP))
    // `origin/HEAD` is a symbolic alias of a remote branch, not a branch of its own.
    .filter(([ref]) => !ref.endsWith("/HEAD"))
    .map(([ref, name, head, sha, upstream, track, date, subject]) => ({
      name,
      remote: ref.startsWith("refs/remotes/"),
      current: head === "*",
      sha,
      upstream: upstream || null,
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
      date: Number(date) || 0,
      subject: subject ?? "",
    }));
}

async function readLog(directory: string, scope: "current" | "all", limit: number) {
  const format = ["%H", "%P", "%an", "%at", "%D", "%s"].join(SEP);
  const revs = scope === "all" ? ["HEAD", "--branches"] : ["HEAD"];
  let out: string;
  try {
    out = await git(directory, ["log", "--topo-order", `--max-count=${limit + 1}`, `--format=${format}`, ...revs, "--"]);
  } catch {
    // A repository with no commits yet has no HEAD to log.
    return { commits: [], more: false };
  }
  const raw = out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, parents, author, date, refs, ...subject] = line.split(SEP);
      return {
        sha,
        parents: parents ? parents.split(" ") : [],
        author,
        date: Number(date) || 0,
        refs: refs ? refs.split(", ") : [],
        subject: subject.join(SEP),
      };
    });
  const more = raw.length > limit;
  return { commits: layoutGraph(raw.slice(0, limit)), more };
}

/**
 * Assigns each commit (newest first, topo order) a lane, GitLens-style. A lane holds the sha it
 * waits for; a commit takes the lane that waits for it, its first parent keeps that lane, and every
 * other parent gets a free lane linked across at mid-row.
 */
export function layoutGraph(commits: Omit<GitCommit, "lane" | "top" | "bottom" | "links">[]): GitCommit[] {
  const lanes: (string | null)[] = [];
  const active = () => lanes.flatMap((sha, index) => (sha ? [index] : []));
  const freeLane = (skip: number) => {
    const index = lanes.findIndex((sha, i) => sha === null && i !== skip);
    return index === -1 ? lanes.length : index;
  };
  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) lane = freeLane(-1);
    const top = active();
    const links: number[] = [];
    // Other lanes waiting for this commit converge into it here and end.
    lanes.forEach((sha, index) => {
      if (sha !== commit.sha) return;
      lanes[index] = null;
      if (index !== lane) links.push(index);
    });
    const [first, ...rest] = commit.parents;
    lanes[lane] = first ?? null;
    for (const parent of rest) {
      let target = lanes.indexOf(parent);
      if (target === -1) {
        target = freeLane(lane);
        lanes[target] = parent;
      }
      if (target !== lane) links.push(target);
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { ...commit, lane, top, bottom: active(), links };
  });
}
