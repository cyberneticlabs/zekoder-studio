import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { openExternalUrl, useRpc, useSettings } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  DEFAULT_REPORT_DAYS,
  codingHealthRpc,
  collectReportRpc,
  listOrgsRpc,
  openReportRpc,
  reportSettings,
  type CodingHealthReport,
} from "../shared/reports.js";
import { errorText } from "../shared/errors.js";
import { Button } from "./button.js";
import { HealthCharts } from "./health-charts.js";
import { Chip } from "./chip.js";
import { Calendar, DateButton } from "./date-picker.js";
import { Dropdown, Raise } from "./dropdown.js";
import {
  aggregate,
  avg,
  defaultFilters,
  isActive,
  type Aggregate,
  type HealthFilters,
} from "./health-aggregate.js";

type Theme = PluginSurfaceProps["theme"];

interface Row {
  key: number;
  label: string;
  tag: string;
  commits: number;
  add: number;
  del: number;
  merged: number;
  closed: number;
  avgAdd: number;
  avgDel: number;
}
type SortKey = Exclude<keyof Row, "key" | "tag">;

const NUMBER = new Intl.NumberFormat();
const DECIMAL = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/** Same columns, and click-to-sort, as the org-health web page's per-contributor / per-repo tables. */
const COLUMNS: { key: SortKey; label: string; value(r: Row): string }[] = [
  { key: "commits", label: "Commits", value: (r) => NUMBER.format(r.commits) },
  { key: "add", label: "+ lines", value: (r) => NUMBER.format(r.add) },
  { key: "del", label: "− lines", value: (r) => NUMBER.format(r.del) },
  { key: "merged", label: "Merged PRs", value: (r) => NUMBER.format(r.merged) },
  { key: "closed", label: "Closed PRs", value: (r) => NUMBER.format(r.closed) },
  { key: "avgAdd", label: "Avg + / PR", value: (r) => DECIMAL.format(r.avgAdd) },
  { key: "avgDel", label: "Avg − / PR", value: (r) => DECIMAL.format(r.avgDel) },
];

const DAY_CHOICES = [1, 7, 30, 60, 90];
const dayLabel = (n: number) => (n === 1 ? "Last day" : `${n} days`);
/** How often the page re-reads the store while a first-time collect runs on the host. */
const COLLECT_POLL_MS = 5_000;

/**
 * The org-health report for an org and window picked here. The daemon rebuilds it from the central
 * org-health store, collecting from GitHub first for an org the store has never seen;
 * `/zekoder-org-health` in an agent fetches new days.
 */
export function CodingHealthPage({ theme, layout }: PluginSurfaceProps) {
  const fetchReport = useRpc(codingHealthRpc);
  const fetchOrgs = useRpc(listOrgsRpc);
  const collectReport = useRpc(collectReportRpc);
  const openReport = useRpc(openReportRpc);
  const params = useSettings(reportSettings);
  const toast = useToast();

  const org = params.status === "ready" ? params.values.org : null;
  const days = params.status === "ready" ? params.values.days : DEFAULT_REPORT_DAYS;

  const orgsQuery = useQuery({ queryKey: ["zekoder", "report-orgs"], queryFn: () => fetchOrgs({}) });
  const orgChoices = [...new Set([...(orgsQuery.data?.orgs ?? []), ...(org ? [org] : [])])];
  const dayChoices = [...new Set([...DAY_CHOICES, days])].sort((a, b) => a - b);
  const choose = (patch: { org?: string; days?: number }) => {
    if (params.status !== "ready") return;
    void params.save({ ...params.values, ...patch }, params.revision);
  };

  const report = useQuery({
    queryKey: ["zekoder", "coding-health", org, days],
    queryFn: () => fetchReport({ org: org!, days }),
    enabled: org !== null,
    refetchInterval: (query) => (query.state.data?.collecting ? COLLECT_POLL_MS : false),
  });
  const collecting = report.data?.collecting ?? false;
  const [filters, setFilters] = useState<HealthFilters | null>(null);
  // A new org/window/rebuild changes every index, so drop filters that no longer point at anything.
  useEffect(() => setFilters(null), [org, days, report.data?.report.generatedAt]);
  const effective = useMemo(
    () => (report.data ? (filters ?? defaultFilters(report.data.report)) : null),
    [report.data, filters],
  );
  const agg = useMemo(
    () => (report.data && effective ? aggregate(report.data.report, effective) : null),
    [report.data, effective],
  );
  const patch = (change: Partial<HealthFilters>) => {
    if (report.data) setFilters({ ...(filters ?? defaultFilters(report.data.report)), ...change });
  };
  const reset = () => setFilters(null);
  const fetchMissing = () => {
    collectReport({ org: org!, days })
      .then(() => report.refetch())
      .catch((error) => toast.error(errorText(error)));
  };
  const openPage = () => {
    openReport({ org: org!, days })
      .then(({ url }) => openExternalUrl(url))
      .catch((error) => toast.error(errorText(error)));
  };

  const muted = { color: theme.colors.foregroundMuted };
  const danger = { color: theme.colors.statusDanger };
  const padding = layout.compact ? 16 : 24;

  if (params.status === "loading") {
    return <Text style={{ padding, ...muted }}>Loading…</Text>;
  }

  const data = report.data?.report;
  return (
    <ScrollView contentContainerStyle={{ padding, gap: 20 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {orgChoices.map((choice) => (
            <Chip
              key={choice}
              theme={theme}
              label={choice}
              selected={choice === org}
              onPress={() => choose({ org: choice })}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {dayChoices.map((choice) => (
            <Chip
              key={choice}
              theme={theme}
              label={dayLabel(choice)}
              selected={choice === days}
              onPress={() => choose({ days: choice })}
            />
          ))}
        </View>
      </View>

      {org === null && (
        <Text style={muted}>
          {orgChoices.length === 0
            ? "No GitHub org yet. Run /zekoder-org-health <org> in an agent, or set one in Zekoder → Reports."
            : "Pick an org above."}
        </Text>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: theme.colors.foreground }}>{org ?? "Coding health"}</Text>
          <Text style={{ fontSize: 12, ...muted }}>
            {data
              ? `${data.window.start} → ${data.window.end} · ${dayLabel(data.window.days.length)} · built ${new Date(data.generatedAt).toLocaleString()}`
              : days === 1 ? dayLabel(days) : `Last ${dayLabel(days)}`}
          </Text>
        </View>
        <Button
          theme={theme}
          icon="RefreshCw"
          label={report.isFetching ? "Loading…" : "Reload"}
          disabled={report.isFetching || org === null}
          onPress={() => void report.refetch()}
        />
        {org !== null && <Button theme={theme} icon="ExternalLink" label="Open report" onPress={openPage} />}
      </View>

      {report.isError && <Text style={danger}>{errorText(report.error)}</Text>}
      {report.data?.collectError && <Text style={danger}>{report.data.collectError}</Text>}
      {orgsQuery.isError && !(report.isError && errorText(report.error) === errorText(orgsQuery.error)) && (
        <Text style={danger}>{errorText(orgsQuery.error)}</Text>
      )}
      {org !== null && report.isPending && !report.isError && <Text style={muted}>Building report…</Text>}

      {collecting && (
        <Text
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: theme.colors.surface1,
            color: theme.colors.statusWarning,
          }}
        >
          Collecting {org} from GitHub. This can take several minutes; the page updates when it finishes.
        </Text>
      )}

      {data && !data.complete && !collecting && (
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            gap: 8,
            alignItems: "flex-start",
            backgroundColor: theme.colors.surface1,
          }}
        >
          <Text style={{ color: theme.colors.statusWarning }}>
            Partial: the cache doesn't cover this whole window
            {data.pendingCommitDetails > 0 ? ` (${NUMBER.format(data.pendingCommitDetails)} commits lack line counts)` : ""}.
          </Text>
          <Button theme={theme} icon="Download" label="Fetch missing days" onPress={fetchMissing} />
        </View>
      )}

      {data && agg && effective && (
        <>
          <FilterBar theme={theme} report={data} filters={effective} patch={patch} reset={reset} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {kpis(agg).map(([label, value]) => (
              <View
                key={label}
                style={{
                  minWidth: 140,
                  flexGrow: 1,
                  padding: 12,
                  gap: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface1,
                }}
              >
                <Text style={{ fontSize: 12, ...muted }}>{label}</Text>
                <Text style={{ fontSize: 20, fontWeight: "600", color: theme.colors.foreground }}>{value}</Text>
              </View>
            ))}
          </View>
          <HealthCharts theme={theme} report={data} agg={agg} filters={effective} />
          <Table
            theme={theme}
            title="Per contributor"
            rows={rowsOf(agg.byUser, (u) => ({
              label: data.users[u].label,
              tag: data.users[u].bot ? "bot" : data.users[u].unlinked ? "unlinked email" : "",
            }))}
            onPick={(user) => patch({ user })}
          />
          <Table
            theme={theme}
            title="Per repository"
            rows={rowsOf(agg.byRepo, (r) => ({ label: data.repos[r], tag: "" }))}
            onPick={(repo) => patch({ repo })}
          />
          <Text style={{ fontSize: 11, ...muted }}>
            Commits: default branch only, merge commits excluded. Lines exclude lockfiles and generated files. Pull
            requests: merged and closed-unmerged, dated by close day. Days are UTC; today and yesterday are never
            included. Tap a table row to filter by it.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Table({ theme, title, rows, onPick }: { theme: Theme; title: string; rows: Row[]; onPick(key: number): void }) {
  const [sortKey, setSortKey] = useState<SortKey>("commits");
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        sortKey === "label" ? a.label.localeCompare(b.label) : b[sortKey] - a[sortKey] || a.label.localeCompare(b.label),
      ),
    [rows, sortKey],
  );
  const cell = { width: 90, textAlign: "right" as const, fontSize: 12, color: theme.colors.foreground };
  const head = { fontWeight: "600" as const, color: theme.colors.foregroundMuted };
  const border = { borderBottomWidth: 1, borderBottomColor: theme.colors.border };
  const mark = (key: SortKey) => (key === sortKey ? " ↓" : "");
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foregroundMuted }}>
        {title.toUpperCase()} ({rows.length})
      </Text>
      {rows.length === 0 ? (
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>No activity for these filters.</Text>
      ) : (
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: "row", paddingVertical: 6, ...border }}>
              <Pressable accessibilityRole="button" onPress={() => setSortKey("label")}>
                <Text style={{ width: 220, fontSize: 12, ...head }}>Name{mark("label")}</Text>
              </Pressable>
              {COLUMNS.map((column) => (
                <Pressable key={column.key} accessibilityRole="button" onPress={() => setSortKey(column.key)}>
                  <Text style={{ ...cell, ...head }}>
                    {column.label}
                    {mark(column.key)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {sorted.map((row) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${row.label}`}
                onPress={() => onPick(row.key)}
                style={{ flexDirection: "row", paddingVertical: 6, ...border }}
              >
                <Text numberOfLines={1} style={{ width: 220, fontSize: 12, color: theme.colors.foreground }}>
                  {row.label}
                  {row.tag ? <Text style={{ color: theme.colors.foregroundMuted }}> · {row.tag}</Text> : null}
                </Text>
                {COLUMNS.map((column) => (
                  <Text key={column.key} style={cell}>
                    {column.value(row)}
                  </Text>
                ))}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

interface FilterBarProps {
  theme: Theme;
  report: CodingHealthReport;
  filters: HealthFilters;
  patch(change: Partial<HealthFilters>): void;
  reset(): void;
}

/** The web page's From / To (calendar pickers) / Repository / Contributor / Include bots / Reset. */
function FilterBar({ theme, report, filters, patch, reset }: FilterBarProps) {
  const days = report.window.days;
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const label = { fontSize: 12, color: theme.colors.foregroundMuted };
  const byLabel = <T extends { i: number; label: string }>(items: T[]) =>
    items.sort((a, b) => a.label.localeCompare(b.label));
  const repos = useMemo(() => byLabel(report.repos.map((r, i) => ({ i, label: r }))), [report.repos]);
  const users = useMemo(
    () => byLabel(report.users.map((u, i) => ({ i, label: u.label + (u.bot ? " (bot)" : "") }))),
    [report.users],
  );
  const pickerFor = (
    title: string,
    allLabel: string,
    items: { i: number; label: string }[],
    current: number,
    set: (i: number) => void,
  ) => (
    <Raise style={{ gap: 4 }}>
      <Text style={label}>{title}</Text>
      <Dropdown
        theme={theme}
        label={title}
        width={280}
        maxListHeight={280}
        placeholder={allLabel}
        value={String(current)}
        options={[{ value: "-1", label: allLabel }, ...items.map((item) => ({ value: String(item.i), label: item.label }))]}
        onChange={(value) => set(Number(value))}
      />
    </Raise>
  );
  return (
    <Raise
      style={{
        gap: 10,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <DateButton theme={theme} title="From" day={days[filters.from]} open={picking === "from"} onPress={() => setPicking(picking === "from" ? null : "from")} />
        <DateButton theme={theme} title="To" day={days[filters.to]} open={picking === "to"} onPress={() => setPicking(picking === "to" ? null : "to")} />
        <Chip theme={theme} label="Include bots" selected={filters.bots} onPress={() => patch({ bots: !filters.bots })} />
        <Button theme={theme} icon="RotateCcw" label="Reset" onPress={reset} />
      </View>
      {picking && (
        <Calendar
          key={picking}
          theme={theme}
          days={days}
          value={days[picking === "from" ? filters.from : filters.to]}
          onPick={(day) => {
            const i = days.indexOf(day);
            patch(picking === "from" ? { from: i, to: Math.max(i, filters.to) } : { to: i, from: Math.min(i, filters.from) });
            setPicking(null);
          }}
        />
      )}
      <Raise style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
        {pickerFor("Repository", "All repositories", repos, filters.repo, (repo) => patch({ repo }))}
        {pickerFor("Contributor", "All contributors", users, filters.user, (user) => patch({ user }))}
      </Raise>
    </Raise>
  );
}

function rowsOf(map: Aggregate["byUser"], describe: (key: number) => { label: string; tag: string }): Row[] {
  return [...map.entries()].map(([key, b]) => {
    const prs = b.merged + b.closed;
    return {
      key,
      ...describe(key),
      commits: b.commits,
      add: b.add,
      del: b.del,
      merged: b.merged,
      closed: b.closed,
      avgAdd: avg(b.prAdd, prs),
      avgDel: avg(b.prDel, prs),
    };
  });
}

function kpis({ total: t, byUser, byRepo }: Aggregate) {
  const prs = t.merged + t.closed;
  return [
    ["Commits", NUMBER.format(t.commits)],
    ["Lines added", NUMBER.format(t.add)],
    ["Lines deleted", NUMBER.format(t.del)],
    ["Merged PRs", NUMBER.format(t.merged)],
    ["Closed unmerged PRs", NUMBER.format(t.closed)],
    ["Avg lines added / PR", DECIMAL.format(avg(t.prAdd, prs))],
    ["Avg lines deleted / PR", DECIMAL.format(avg(t.prDel, prs))],
    ["Active contributors", NUMBER.format([...byUser.values()].filter(isActive).length)],
    ["Active repositories", NUMBER.format([...byRepo.values()].filter(isActive).length)],
  ] as const;
}
