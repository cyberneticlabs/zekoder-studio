import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { VERSION_POLL_MS, versionStatusRpc } from "../shared/version.js";
import { MachineDefaultsPanel, useMachineDefaultsQuery } from "./machine-defaults-panel.js";
import { providersSet } from "./provider-onboarding.js";
import { ReportSettingsPanel } from "./report-settings-panel.js";
import { TabBar } from "./tab-bar.js";
import { TelemetryPanel } from "./telemetry-panel.js";
import { VERSION_STATUS_KEY, VersionPanel, hasFailedInstall } from "./version-panel.js";

type TabId = "reports" | "defaults" | "telemetry" | "version";

/** The Zekoder page: global settings — report parameters, machine agent defaults, machine telemetry consent and version. Workflow settings are per project, in the workspace "+" menu. */
export function ZekoderSurface({ theme, layout }: PluginSurfaceProps) {
  const [tab, setTab] = useState<TabId>("reports");
  const fetchStatus = useRpc(versionStatusRpc);
  const status = useQuery({
    queryKey: VERSION_STATUS_KEY,
    queryFn: () => fetchStatus({}),
    // The Version tab polls the same query itself; polling here too would double the fetches.
    refetchInterval: tab === "version" ? false : VERSION_POLL_MS,
  });
  const installFailed = hasFailedInstall(status.data);
  const machine = useMachineDefaultsQuery().data?.state;
  const needsProviders = machine?.machineScope === true && !providersSet(machine.values);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      {needsProviders && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("defaults")}
          style={{ padding: 10, backgroundColor: theme.colors.surface1 }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>Set up providers</Text>
          <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
            Pick the planning and coding providers agents start with.
          </Text>
        </Pressable>
      )}
      <TabBar<TabId>
        theme={theme}
        compact={layout.compact}
        tabs={[
          { id: "reports", label: "Reports" },
          { id: "defaults", label: "Defaults" },
          { id: "telemetry", label: "Telemetry" },
          { id: "version", label: "Version", dot: installFailed ? "Install failed" : undefined },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      <View style={{ flex: 1, padding: layout.compact ? 16 : 24 }}>
        {tab === "reports" && <ReportSettingsPanel theme={theme} />}
        {tab === "defaults" && <MachineDefaultsPanel theme={theme} />}
        {tab === "telemetry" && <TelemetryPanel theme={theme} />}
        {tab === "version" && <VersionPanel theme={theme} />}
      </View>
    </View>
  );
}
