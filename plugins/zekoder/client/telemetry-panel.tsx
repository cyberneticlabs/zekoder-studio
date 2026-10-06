import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { errorText } from "../shared/errors.js";
import { getTelemetryRpc, setTelemetryRpc, type TelemetryState } from "../shared/telemetry.js";
import { Section } from "./agent-defaults.js";
import { Chip } from "./chip.js";

type Theme = PluginSurfaceProps["theme"];

const telemetryKey = ["zekoder", "telemetry"];

const CONSENT_LABELS: Record<TelemetryState["consent"], string> = {
  granted: "Opted in",
  declined: "Opted out",
  unset: "Not chosen yet",
};

/** The Telemetry tab of the global Zekoder page: this machine's anonymous usage-telemetry consent. */
export function TelemetryPanel({ theme }: { theme: Theme }) {
  const queryClient = useQueryClient();
  const fetchTelemetry = useRpc(getTelemetryRpc);
  const saveTelemetry = useRpc(setTelemetryRpc);
  const telemetry = useQuery({ queryKey: telemetryKey, queryFn: () => fetchTelemetry({}) });
  const save = useMutation({
    mutationFn: (consent: "granted" | "declined") => saveTelemetry({ consent }),
    onSuccess: (data) => queryClient.setQueryData(telemetryKey, data),
  });

  const muted = { color: theme.colors.foregroundMuted };
  const { data, isPending, isError, error } = telemetry;
  const state = data?.state ?? null;

  return (
    <ScrollView contentContainerStyle={{ gap: 20 }}>
      {isPending && <Text style={muted}>Loading…</Text>}
      {isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(error)}</Text>}
      {save.isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(save.error)}</Text>}
      {data && !state && <Text style={muted}>Open a Zekoder project in Paseo to change telemetry.</Text>}
      {state && (
        <Section theme={theme} title="Usage telemetry">
          <Text style={{ fontSize: 13, color: theme.colors.foreground }}>
            Zekoder can send anonymous usage events. This choice applies to every repo on this machine.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <Chip
              theme={theme}
              label="Opt in"
              selected={state.consent === "granted"}
              onPress={() => state.consent !== "granted" && !save.isPending && save.mutate("granted")}
            />
            <Chip
              theme={theme}
              label="Opt out"
              selected={state.consent === "declined"}
              onPress={() => state.consent !== "declined" && !save.isPending && save.mutate("declined")}
            />
            {save.isPending && <Text style={{ fontSize: 12, ...muted }}>Saving…</Text>}
          </View>
          <Text style={{ fontSize: 12, ...muted }}>
            Status: {CONSENT_LABELS[state.consent]}
            {" · "}
            sending: {state.effective ? "on" : "off"}
          </Text>
        </Section>
      )}
    </ScrollView>
  );
}
