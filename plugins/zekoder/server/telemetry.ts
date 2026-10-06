import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { getTelemetryRpc, setTelemetryRpc, TelemetryState } from "../shared/telemetry.js";
import { callTool, zekoderProjects } from "./zekoder.js";

/** Consent is per machine, so any project's zekoder-mcp can carry the call; `root` is tried first. */
async function transportRoot(paseo: PluginHandlerContext["paseo"], root: string | undefined): Promise<string | null> {
  const roots = (await zekoderProjects(paseo)).map((project) => project.root);
  return root && roots.includes(root) ? root : (roots[0] ?? null);
}

async function runTelemetry(root: string, action: "status" | "grant" | "decline"): Promise<TelemetryState> {
  // No `cwd`: zekoder-mcp then treats the call as machine-only and never reads the repo config.
  const payload = (await callTool(root, "zekoder_telemetry", { action })) as {
    resolution?: { consent?: TelemetryState["consent"]; effective?: boolean };
  } | null;
  const { consent, effective } = payload?.resolution ?? {};
  if (!consent) throw new Error("Needs a newer zekoder-mcp.");
  return { consent, effective: effective === true };
}

export async function getTelemetry(
  input: RpcInput<typeof getTelemetryRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof getTelemetryRpc>> {
  const root = await transportRoot(paseo, input.root);
  return { state: root ? await runTelemetry(root, "status") : null };
}

export async function setTelemetry(
  input: RpcInput<typeof setTelemetryRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof setTelemetryRpc>> {
  const root = await transportRoot(paseo, input.root);
  if (!root) throw new Error("Open a Zekoder project in Paseo first.");
  return { state: await runTelemetry(root, input.consent === "granted" ? "grant" : "decline") };
}
