import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text } from "react-native";
import {
  AGENT_TABS,
  type AgentTab,
  getMachineDefaultsRpc,
  listProvidersRpc,
  setMachineDefaultsRpc,
  type AgentDefaultsPatch,
} from "../shared/config.js";
import { errorText } from "../shared/errors.js";
import { AgentDefaultsEditor } from "./agent-defaults.js";
import { TabBar, type Tab } from "./tab-bar.js";

type Theme = PluginSurfaceProps["theme"];

const DEFAULT_TABS: readonly Tab<AgentTab>[] = [
  { id: "planning", label: "Planning" },
  { id: "coding", label: "Coding" },
];

const machineDefaultsKey = (root?: string) => ["zekoder", "machine-defaults", root ?? null];

/** The machine tier read alone (no provider list). `root` only prefers a transport project. */
export function useMachineDefaultsQuery(root?: string, enabled = true) {
  const fetchDefaults = useRpc(getMachineDefaultsRpc);
  return useQuery({ queryKey: machineDefaultsKey(root), queryFn: () => fetchDefaults({ root }), enabled });
}

/** Machine tier state plus the provider list and its save mutation. */
export function useMachineDefaults(root?: string) {
  const queryClient = useQueryClient();
  const saveDefaults = useRpc(setMachineDefaultsRpc);
  const fetchProviders = useRpc(listProvidersRpc);
  const defaults = useMachineDefaultsQuery(root);
  const providers = useQuery({
    queryKey: ["zekoder", "providers", null],
    queryFn: () => fetchProviders({}),
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (agentDefaults: AgentDefaultsPatch) => saveDefaults({ root, agentDefaults }),
    onSuccess: (data) => queryClient.setQueryData(machineDefaultsKey(root), data),
  });
  return { defaults, providers, save };
}

type MachineDefaults = ReturnType<typeof useMachineDefaults>;

/** The machine editor over one `useMachineDefaults` result; `tabs` defaults to both sessions. */
export function MachineEditor({
  theme,
  machine,
  tabs = AGENT_TABS,
  showRoles,
}: {
  theme: Theme;
  machine: MachineDefaults;
  tabs?: readonly AgentTab[];
  showRoles: boolean;
}) {
  const { defaults, providers, save } = machine;
  const state = defaults.data?.state;
  if (!state) return null;
  const error = save.isError
    ? errorText(save.error)
    : (defaults.data?.error ?? (providers.data?.error ? `Provider list unavailable: ${providers.data.error}` : null));
  return (
    <AgentDefaultsEditor
      theme={theme}
      scope="machine"
      tabs={tabs}
      showRoles={showRoles}
      state={state}
      providers={providers.data?.providers ?? []}
      saving={save.isPending}
      error={error}
      onSave={(patch) => save.mutate(patch)}
    />
  );
}

/** Last path segment of a project root, for the footer. */
function projectLabel(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root;
}

/** The Defaults tab of the global Zekoder page: the machine tier of agent defaults. */
export function MachineDefaultsPanel({ theme }: { theme: Theme }) {
  const machine = useMachineDefaults();
  const [tab, setTab] = useState<AgentTab>("planning");
  const muted = { color: theme.colors.foregroundMuted };
  const { data, isPending, isError, error } = machine.defaults;
  return (
    <ScrollView contentContainerStyle={{ gap: 16 }}>
      {isPending && <Text style={muted}>Loading…</Text>}
      {isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(error)}</Text>}
      {data && !data.state && (
        <Text style={muted}>{data.error ?? "Open a Zekoder project in Paseo first."}</Text>
      )}
      {data?.state && (
        <>
          <Text style={{ fontSize: 13, ...muted }}>
            Machine defaults apply to every repo unless the repo or its execution profile sets the field.
          </Text>
          <TabBar<AgentTab> theme={theme} compact={false} flush tabs={DEFAULT_TABS} selected={tab} onSelect={setTab} />
          <MachineEditor theme={theme} machine={machine} tabs={[tab]} showRoles />
          {data.transportRoot && (
            <Text style={{ fontSize: 11, ...muted }}>Saved through zekoder-mcp of {projectLabel(data.transportRoot)}.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}
