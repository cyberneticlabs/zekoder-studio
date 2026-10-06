import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const telemetryStateSchema = z.object({
  consent: z.enum(["unset", "granted", "declined"]),
  /** False when consent is granted but this build has no endpoint key, so nothing is sent. */
  effective: z.boolean(),
});
export type TelemetryState = z.infer<typeof telemetryStateSchema>;

/** `state` is null when no Zekoder project is open to carry the call. */
const telemetryOutputSchema = z.object({ state: telemetryStateSchema.nullable() });

/** Machine consent, read through any Zekoder project's zekoder-mcp. `root` only prefers a project. */
export const getTelemetryRpc = defineRpc({
  name: "zekoder.telemetry.get",
  input: z.object({ root: z.string().optional() }),
  output: telemetryOutputSchema,
});

export const setTelemetryRpc = defineRpc({
  name: "zekoder.telemetry.set",
  input: z.object({ root: z.string().optional(), consent: z.enum(["granted", "declined"]) }),
  output: telemetryOutputSchema,
});
