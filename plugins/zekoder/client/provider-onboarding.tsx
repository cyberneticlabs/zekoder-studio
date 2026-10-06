import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import { Button } from "./button.js";
import { MachineEditor, useMachineDefaults } from "./machine-defaults-panel.js";

type Theme = PluginSurfaceProps["theme"];

/** Machine planning and coding providers are both set. */
export function providersSet(values: { planning?: { provider?: string }; coding?: { provider?: string } } | undefined): boolean {
  return Boolean(values?.planning?.provider && values?.coding?.provider);
}

/** First-run provider picker: the machine editor without the roles block, plus a Done button. */
export function ProviderOnboarding({ theme, root, onDone }: { theme: Theme; root?: string; onDone: () => void }) {
  const machine = useMachineDefaults(root);
  const state = machine.defaults.data?.state;
  return (
    <View style={{ gap: 12, flexShrink: 1 }}>
      {machine.defaults.isPending && <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>}
      <ScrollView contentContainerStyle={{ gap: 16 }}>
        <MachineEditor theme={theme} machine={machine} showRoles={false} />
      </ScrollView>
      <View style={{ flexDirection: "row" }}>
        <Button theme={theme} icon="Check" label="Done" primary disabled={!providersSet(state?.values)} onPress={onDone} />
      </View>
    </View>
  );
}
