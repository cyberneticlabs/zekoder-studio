import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Branch of the checkout an agent works in. Never throws: a non-zekoder or non-git cwd is a normal answer. */
export const agentBranchRpc = defineRpc({
  name: "zekoder.agent.branch",
  input: z.object({ cwd: z.string() }),
  output: z.object({
    /** True when `cwd` sits inside a project with a `.zekoder/` workspace; the pill hides otherwise. */
    zekoder: z.boolean(),
    /** Branch name, `detached @ <sha>` for a detached HEAD, null when `cwd` is not a git checkout. */
    branch: z.string().nullable(),
  }),
});
