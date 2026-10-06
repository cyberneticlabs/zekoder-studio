import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ITEM_TYPES,
  issueFiltersSettings,
  STATUS_FILTERS,
  listIssuesRpc,
  listProjectsRpc,
  migrateWorkspaceRpc,
  needsMigration,
  type IssueFilters,
  type ItemType,
  type StatusFilter,
  type ZekoderIssue,
} from "../shared/issues.js";
import { errorText } from "../shared/errors.js";
import { Chip } from "./chip.js";
import { StartAgentButton } from "./start-agent-button.js";
import { Dropdown, Raise } from "./dropdown.js";
import { IssueDetail } from "./issue-detail.js";
import { IssueRow } from "./issue-row.js";
import { inputStyle } from "./styles.js";

const DEFAULT_FILTERS: IssueFilters = { root: null, status: "open", types: [] };

const TYPE_LABELS: Record<ItemType, string> = {
  feature: "Features",
  bug: "Bugs",
  followup: "Followups",
  "vendor-issues": "Vendor issues",
  decision: "Decisions",
  idea: "Ideas",
};
const STATUS_LABELS: Record<StatusFilter, string> = {
  open: "Open",
  planned: "Planned",
  "in-progress": "In Progress",
  done: "Done",
  all: "All",
};
const SEARCH_DEBOUNCE_MS = 250;
const DETAIL_PANEL_WIDTH = 400;

type Selection = { id: string; type: ItemType };

/** Workspace tab: the issues page pinned to the workspace's own project. */
export function IssuesPanel(props: PluginWorkspacePanelProps) {
  const root = useWorkspace(props.workspaceId, (workspace) => workspace.projectRootPath);
  return <IssuesTab {...props} lockedRoot={root ?? undefined} workspaceId={props.workspaceId} />;
}

export function IssuesTab({
  theme,
  layout,
  navigation,
  lockedRoot,
  workspaceId,
}: Pick<PluginSurfaceProps, "theme" | "layout" | "navigation"> & { lockedRoot?: string; workspaceId?: string }) {
  const fetchProjects = useRpc(listProjectsRpc);
  const fetchIssues = useRpc(listIssuesRpc);
  const migrate = useRpc(migrateWorkspaceRpc);

  const settings = useSettings(issueFiltersSettings);
  const [filters, setFiltersState] = useState<IssueFilters>(DEFAULT_FILTERS);
  const hydrated = useRef(false);
  useEffect(() => {
    if (settings.status !== "ready" || hydrated.current) return;
    hydrated.current = true;
    setFiltersState(settings.values);
  }, [settings]);

  /** Updates local state immediately; persists best-effort (a save race just loses the losing patch). */
  const updateFilters = (patch: Partial<IssueFilters>) =>
    setFiltersState((current) => {
      const next = { ...current, ...patch };
      if (settings.status === "ready") void settings.save(next, settings.revision);
      return next;
    });
  const setRoot = (value: string | null) => updateFilters({ root: value });
  const setStatus = (value: StatusFilter) => updateFilters({ status: value });
  const { root, status, types } = filters;

  const [queryText, setQueryText] = useState("");
  const query = useDebounced(queryText.trim(), SEARCH_DEBOUNCE_MS);
  const [selected, setSelected] = useState<Selection | null>(null);

  const projects = useQuery({
    queryKey: ["zekoder", "projects"],
    queryFn: () => fetchProjects({}),
  });
  const projectList = projects.data?.projects ?? [];
  const activeRoot = lockedRoot ?? root ?? projectList[0]?.root ?? null;

  const issues = useQuery({
    queryKey: ["zekoder", "issues", activeRoot, query, types, status],
    queryFn: () =>
      fetchIssues({ root: activeRoot!, query: query || undefined, itemTypes: types, status }),
    enabled: activeRoot !== null,
    placeholderData: keepPreviousData,
  });

  const styles = useMemo(
    () => ({
      screen: { flex: 1, flexDirection: "row" as const, backgroundColor: theme.colors.surface0 },
      list: { flex: 1, padding: layout.compact ? 16 : 24, gap: 12 },
      panel: {
        width: DETAIL_PANEL_WIDTH,
        padding: 24,
        borderLeftWidth: 1,
        borderLeftColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { flex: 1, fontSize: 18, fontWeight: "600" as const, color: theme.colors.foreground },
      row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
      search: { ...inputStyle(theme), paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
      muted: { color: theme.colors.foregroundMuted },
      warning: { color: theme.colors.statusWarning },
      error: { color: theme.colors.statusDanger },
    }),
    [theme, layout.compact],
  );

  const toggleType = (type: ItemType) =>
    updateFilters({
      types: types.includes(type) ? types.filter((t) => t !== type) : [...types, type],
    });

  return (
    <View style={styles.screen}>
      <View style={styles.list}>
        <View style={styles.header}>
          <Text style={styles.title}>Issues</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh issues"
            onPress={() => {
              void projects.refetch();
              void issues.refetch();
            }}
          >
            <Icon name="RefreshCw" size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>

        {!lockedRoot && projectList.length > 1 && (
          <Raise>
            <Dropdown
              theme={theme}
              label="Project"
              width={280}
              placeholder="Select project"
              value={activeRoot}
              options={projectList.map((project) => ({ value: project.root, label: project.name }))}
              onChange={(value) => {
                setRoot(value);
                setSelected(null);
              }}
            />
          </Raise>
        )}

        <TextInput
          style={styles.search}
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Search issues"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search issues"
        />

        <View style={styles.row}>
          {STATUS_FILTERS.map((value) => (
            <Chip
              key={value}
              theme={theme}
              label={STATUS_LABELS[value]}
              selected={status === value}
              onPress={() => setStatus(value)}
            />
          ))}
        </View>
        <View style={styles.row}>
          {ITEM_TYPES.map((type) => (
            <Chip
              key={type}
              theme={theme}
              label={TYPE_LABELS[type]}
              selected={types.includes(type)}
              onPress={() => toggleType(type)}
            />
          ))}
        </View>

        {projects.isError && <Text style={styles.error}>{errorText(projects.error)}</Text>}
        {projects.isSuccess && projectList.length === 0 && (
          <Text style={styles.muted}>No Paseo project has a .zekoder/ workspace yet.</Text>
        )}
        {issues.isError && <Text style={styles.error}>{errorText(issues.error)}</Text>}
        {issues.data?.warnings.map((warning) => (
          <View key={warning} style={{ gap: 6, alignItems: "flex-start" }}>
            <Text style={styles.warning}>{warning}</Text>
            {needsMigration(warning) && activeRoot && (
              <StartAgentButton
                theme={theme}
                icon="Wrench"
                label="Migrate"
                enabled
                disabledHint=""
                navigation={navigation}
                root={activeRoot}
                start={() => migrate({ root: activeRoot, workspaceId })}
              />
            )}
          </View>
        ))}
        {issues.data && (
          <Text style={styles.muted}>
            {issues.data.issues.length === issues.data.total
              ? `${issues.data.total} items`
              : `${issues.data.issues.length} of ${issues.data.total} items`}
            {issues.isFetching ? " · refreshing…" : ""}
          </Text>
        )}

        <FlatList<ZekoderIssue>
          data={issues.data?.issues ?? []}
          keyExtractor={(issue) => `${issue.type}:${issue.id}`}
          renderItem={({ item }) => (
            <IssueRow
              issue={item}
              theme={theme}
              selected={selected?.id === item.id && selected.type === item.type}
              onPress={() => setSelected({ id: item.id, type: item.type as ItemType })}
            />
          )}
          ListEmptyComponent={
            issues.isSuccess ? <Text style={styles.muted}>No matching items.</Text> : null
          }
        />
      </View>

      {selected && activeRoot && !layout.compact && (
        <View style={styles.panel}>
          <IssueDetail
            key={`${selected.type}:${selected.id}`}
            theme={theme}
            root={activeRoot}
            workspaceId={workspaceId}
            {...selected}
            navigation={navigation}
            onClose={() => setSelected(null)}
          />
        </View>
      )}
      {layout.compact && (
        <Modal
          title={selected?.id ?? ""}
          open={selected !== null}
          onOpenChange={(open) => !open && setSelected(null)}
        >
          <Modal.Content scrollable={false} style={{ flex: 1 }}>
            {selected && activeRoot && (
              <IssueDetail
                theme={theme}
                root={activeRoot}
                workspaceId={workspaceId}
                {...selected}
                navigation={navigation}
                inlineDocs
              />
            )}
          </Modal.Content>
        </Modal>
      )}
    </View>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
