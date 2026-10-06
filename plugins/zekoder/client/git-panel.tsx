import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { errorText } from "../shared/errors.js";
import { gitOverviewRpc, type GitBranch, type GitCommit, type GitWorktree, type HistoryScope } from "../shared/git.js";

type Theme = PluginSurfaceProps["theme"];

const PAGE_SIZE = 100;
const POLL_MS = 15_000;
const ROW_HEIGHT = 26;
const LANE_WIDTH = 12;
/** Lanes past this are clipped so a wide graph can't push subjects out of a narrow panel. */
const MAX_LANES = 8;

/** Right-panel tab: worktrees, branches and a lane graph of the workspace checkout's history. */
export function GitPanel({ theme, workspaceId }: PluginWorkspacePanelProps) {
  const checkout = useWorkspace(workspaceId, (w) => w.directory);
  const kind = useWorkspace(workspaceId, (w) => w.projectKind);
  const fetchOverview = useRpc(gitOverviewRpc);
  const [scope, setScope] = useState<HistoryScope>("current");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const directory = kind === "git" ? checkout : null;

  const overview = useQuery({
    queryKey: ["zekoder", "git", directory, scope, limit],
    queryFn: () => fetchOverview({ directory: directory!, scope, limit }),
    enabled: directory !== null,
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  });

  const muted = { color: theme.colors.foregroundMuted, fontSize: 12, padding: 12 };
  if (checkout === null) return <Text style={muted}>Loading workspace…</Text>;
  if (directory === null) return <Text style={muted}>This workspace is not a git checkout.</Text>;
  const data = overview.data;
  const local = data?.branches.filter((branch) => !branch.remote) ?? [];
  const remote = data?.branches.filter((branch) => branch.remote) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ flex: 1, fontWeight: "600", color: theme.colors.foreground }}>Git</Text>
        <IconButton
          theme={theme}
          icon={scope === "all" ? "GitFork" : "GitCommitVertical"}
          label={scope === "all" ? "Showing all branches; show current branch only" : "Showing current branch; show all branches"}
          onPress={() => setScope(scope === "all" ? "current" : "all")}
        />
        <IconButton theme={theme} icon="RefreshCw" label="Refresh" onPress={() => void overview.refetch()} />
      </View>
      {overview.error ? (
        <Text style={{ ...muted, color: theme.colors.statusDanger }}>{errorText(overview.error)}</Text>
      ) : !data ? (
        <Text style={muted}>Loading…</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <Section theme={theme} title="Worktrees" count={data.worktrees.length}>
            {data.worktrees.map((worktree) => (
              <WorktreeRow key={worktree.path} theme={theme} worktree={worktree} />
            ))}
          </Section>
          <Divider theme={theme} />
          <Section theme={theme} title="Branches" count={data.branches.length}>
            <Section theme={theme} title="Local" count={local.length} depth={1}>
              {local.map((branch) => <BranchRow key={branch.name} theme={theme} branch={branch} />)}
            </Section>
            {remote.length > 0 && (
              <Section theme={theme} title="Remote" count={remote.length} depth={1} initiallyOpen={false}>
                {remote.map((branch) => <BranchRow key={branch.name} theme={theme} branch={branch} />)}
              </Section>
            )}
          </Section>
          <Divider theme={theme} />
          <Section theme={theme} title={scope === "all" ? "History · all branches" : "History"} count={data.commits.length}>
            <CommitGraph theme={theme} commits={data.commits} />
            {data.more && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Load more commits"
                onPress={() => setLimit(limit + PAGE_SIZE)}
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.accent }}>
                  {overview.isFetching ? "Loading…" : "Load more"}
                </Text>
              </Pressable>
            )}
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function IconButton({ theme, icon, label, onPress }: { theme: Theme; icon: string; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ padding: 4, borderRadius: 4 }}>
      <Icon name={icon} size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function Divider({ theme }: { theme: Theme }) {
  return <View style={{ height: 1, marginVertical: 4, backgroundColor: theme.colors.border }} />;
}

interface SectionProps {
  theme: Theme;
  title: string;
  count: number;
  depth?: number;
  initiallyOpen?: boolean;
  children: ReactNode;
}

function Section({ theme, title, count, depth = 0, initiallyOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count}`}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, height: ROW_HEIGHT, paddingLeft: 8 + depth * 12, paddingRight: 12 }}
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: depth ? 12 : 11,
            fontWeight: "600",
            color: depth ? theme.colors.foreground : theme.colors.foregroundMuted,
            textTransform: depth ? "none" : "uppercase",
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{count}</Text>
      </Pressable>
      {open && children}
    </View>
  );
}

interface TreeRowProps {
  theme: Theme;
  icon: string;
  label: string;
  detail?: string;
  /** Short text pinned right (counts, sha). */
  trailing?: string;
  current: boolean;
  depth: number;
  accessibilityLabel: string;
}

function TreeRow({ theme, icon, label, detail, trailing, current, depth, accessibilityLabel }: TreeRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, height: ROW_HEIGHT, paddingLeft: 26 + depth * 12, paddingRight: 12 }}
    >
      <Icon name={icon} size={14} color={current ? theme.colors.accent : theme.colors.foregroundMuted} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: theme.colors.foreground, fontWeight: current ? "600" : "400" }}>
        {label}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: theme.colors.foregroundMuted }}>
          {detail}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {trailing ? <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{trailing}</Text> : null}
    </View>
  );
}

function WorktreeRow({ theme, worktree }: { theme: Theme; worktree: GitWorktree }) {
  const folder = worktree.path.split("/").filter(Boolean).pop() ?? worktree.path;
  const label = worktree.branch ?? `detached @ ${worktree.sha}`;
  const flags = [worktree.main && "main", worktree.locked && "locked", worktree.prunable && "prunable"].filter(Boolean);
  return (
    <TreeRow
      theme={theme}
      icon={worktree.current ? "CircleCheck" : worktree.prunable ? "FolderX" : "FolderGit2"}
      label={label}
      detail={folder}
      trailing={flags.join(" · ") || undefined}
      current={worktree.current}
      depth={0}
      accessibilityLabel={`Worktree ${label} at ${worktree.path}${worktree.current ? ", current" : ""}`}
    />
  );
}

function BranchRow({ theme, branch }: { theme: Theme; branch: GitBranch }) {
  const track = [branch.ahead && `↑${branch.ahead}`, branch.behind && `↓${branch.behind}`].filter(Boolean).join(" ");
  return (
    <TreeRow
      theme={theme}
      icon={branch.current ? "CircleCheck" : branch.remote ? "Cloud" : "GitBranch"}
      label={branch.name}
      detail={relativeTime(branch.date)}
      trailing={track || undefined}
      current={branch.current}
      depth={1}
      accessibilityLabel={`Branch ${branch.name}${branch.current ? ", current" : ""}${track ? `, ${track}` : ""}`}
    />
  );
}

function CommitGraph({ theme, commits }: { theme: Theme; commits: GitCommit[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (commits.length === 0) {
    return <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, paddingLeft: 26 }}>No commits yet.</Text>;
  }
  const widest = Math.max(...commits.flatMap((c) => [c.lane, ...c.top, ...c.bottom, ...c.links]));
  const width = (Math.min(widest, MAX_LANES - 1) + 1) * LANE_WIDTH;
  return (
    <View>
      {commits.map((commit) => (
        <View key={commit.sha}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: expanded === commit.sha }}
            accessibilityLabel={`Commit ${commit.sha.slice(0, 7)}: ${commit.subject}`}
            onPress={() => setExpanded(expanded === commit.sha ? null : commit.sha)}
            style={{ flexDirection: "row", alignItems: "center", height: ROW_HEIGHT, paddingLeft: 12, paddingRight: 12, gap: 6 }}
          >
            <GraphCell theme={theme} commit={commit} width={width} />
            {commit.refs.map((ref) => (
              <RefPill key={ref} theme={theme} label={ref} />
            ))}
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: theme.colors.foreground }}>
              {commit.subject}
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{relativeTime(commit.date)}</Text>
          </Pressable>
          {expanded === commit.sha && (
            <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 6 }}>
              <GraphCell theme={theme} commit={{ ...commit, top: commit.bottom, links: [], lane: -1 }} width={width} fill />
              <View style={{ flex: 1, paddingVertical: 4, gap: 2 }}>
                <Text selectable style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{commit.sha}</Text>
                <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>
                  {commit.author} · {new Date(commit.date * 1000).toLocaleString()}
                </Text>
                <Text selectable style={{ fontSize: 12, color: theme.colors.foreground }}>{commit.subject}</Text>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** Lane colors cycle through the theme's palette; lane 0 (usually the first-parent line) gets the accent. */
function laneColor(theme: Theme, lane: number): string {
  const palette = [
    theme.colors.accent,
    theme.colors.statusSuccess,
    theme.colors.statusWarning,
    theme.colors.statusDanger,
    theme.colors.foregroundMuted,
  ];
  return palette[lane % palette.length];
}

interface GraphCellProps {
  theme: Theme;
  commit: Pick<GitCommit, "lane" | "top" | "bottom" | "links">;
  width: number;
  /** Detail rows: draw `top` lanes as full-height pass-through lines, at the row's own height. */
  fill?: boolean;
}

/** One row's slice of the graph: half-height lane lines, mid-row links, and the commit dot. */
function GraphCell({ theme, commit, width, fill }: GraphCellProps) {
  const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;
  const visible = (lane: number) => lane < MAX_LANES;
  const line = 2;
  const dot = 8;
  const mid = ROW_HEIGHT / 2;
  return (
    <View style={{ width, height: fill ? undefined : ROW_HEIGHT, alignSelf: "stretch", overflow: "hidden" }}>
      {commit.top.filter(visible).map((lane) => (
        <View
          key={`t${lane}`}
          style={{
            position: "absolute",
            left: x(lane) - line / 2,
            width: line,
            top: 0,
            ...(fill ? { bottom: 0 } : { height: mid }),
            backgroundColor: laneColor(theme, lane),
          }}
        />
      ))}
      {!fill &&
        commit.bottom.filter(visible).map((lane) => (
          <View
            key={`b${lane}`}
            style={{ position: "absolute", left: x(lane) - line / 2, width: line, top: mid, bottom: 0, backgroundColor: laneColor(theme, lane) }}
          />
        ))}
      {commit.links.filter(visible).map((lane) => (
        <View
          key={`l${lane}`}
          style={{
            position: "absolute",
            left: x(Math.min(lane, commit.lane)) - line / 2,
            width: Math.abs(x(lane) - x(commit.lane)) + line,
            top: mid - line / 2,
            height: line,
            backgroundColor: laneColor(theme, Math.max(lane, commit.lane)),
          }}
        />
      ))}
      {commit.lane >= 0 && visible(commit.lane) && (
        <View
          style={{
            position: "absolute",
            left: x(commit.lane) - dot / 2,
            top: mid - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            borderWidth: 2,
            borderColor: laneColor(theme, commit.lane),
            backgroundColor: theme.colors.surface0,
          }}
        />
      )}
    </View>
  );
}

function RefPill({ theme, label }: { theme: Theme; label: string }) {
  const head = label.startsWith("HEAD");
  return (
    <View
      style={{
        paddingHorizontal: 5,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: head ? theme.colors.accent : theme.colors.border,
        backgroundColor: head ? theme.colors.accent : theme.colors.surface1,
        maxWidth: 120,
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 10, color: head ? theme.colors.accentForeground : theme.colors.foreground }}>
        {label.replace(/^HEAD -> /, "")}
      </Text>
    </View>
  );
}

function relativeTime(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  const units: [number, string][] = [
    [365 * 86400, "y"],
    [30 * 86400, "mo"],
    [7 * 86400, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [size, unit] of units) if (diff >= size) return `${Math.floor(diff / size)}${unit}`;
  return "now";
}
