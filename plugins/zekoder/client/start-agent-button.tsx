import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import type { AgentTab } from "../shared/config.js";
import { errorText } from "../shared/errors.js";
import type { LaunchResult } from "../shared/issues.js";
import { Button } from "./button.js";
import { useMachineDefaultsQuery } from "./machine-defaults-panel.js";
import { ProviderOnboarding } from "./provider-onboarding.js";

type Theme = PluginSurfaceProps["theme"];
type Navigation = PluginSurfaceProps["navigation"];

interface StartAgentButtonProps {
  theme: Theme;
  icon: string;
  label: string;
  enabled: boolean;
  /** Shown under the button while it is disabled for the item's status. */
  disabledHint: string;
  navigation?: Navigation;
  /** The project the launch runs in; prefers its zekoder-mcp for the machine-tier onboarding. */
  root: string;
  start(): Promise<LaunchResult>;
}

function tabLabel(tab: AgentTab): string {
  return tab === "planning" ? "Planning" : "Coding";
}

/** Starts an agent in the project's workspace via `start`, then opens it. */
export function StartAgentButton({ theme, icon, label, enabled, disabledHint, navigation, root, start: run }: StartAgentButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const start = useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      if (result.status === "started") navigation?.openAgent({ agentId: result.agentId });
    },
  });
  const onboarding = start.data?.status === "needs-onboarding" ? start.data.tab : null;
  const machine = useMachineDefaultsQuery(root, onboarding !== null);
  const machineScope = machine.data?.state?.machineScope === true;
  const muted = { fontSize: 12, color: theme.colors.foregroundMuted };
  return (
    <View style={{ gap: 4, alignItems: "flex-start" }}>
      <Button
        theme={theme}
        icon={icon}
        label={start.isPending ? "Starting…" : start.isSuccess && !onboarding ? "Agent started" : label}
        primary
        disabled={!enabled || start.isPending || (start.isSuccess && !onboarding)}
        onPress={() => start.mutate()}
      />
      {!enabled && <Text style={muted}>{disabledHint}</Text>}
      {onboarding && machine.isPending && <Text style={muted}>Checking provider defaults…</Text>}
      {onboarding && !machine.isPending && !machineScope && (
        <Text style={muted}>
          No {onboarding} provider is set yet. Set it in this project's Zekoder settings → {tabLabel(onboarding)} tab.
        </Text>
      )}
      {onboarding && machineScope && (
        <>
          <Button theme={theme} icon="Settings" label="Choose a provider" onPress={() => setPickerOpen(true)} />
          <Modal title="Set up providers" open={pickerOpen} onOpenChange={setPickerOpen}>
            <Modal.Content>
              <Text style={{ ...muted, marginBottom: 12 }}>No {onboarding} provider is set yet. Pick one to continue.</Text>
              <ProviderOnboarding
                theme={theme}
                root={root}
                onDone={() => {
                  setPickerOpen(false);
                  start.mutate();
                }}
              />
            </Modal.Content>
          </Modal>
        </>
      )}
      {start.isError && (
        <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>{errorText(start.error)}</Text>
      )}
    </View>
  );
}
