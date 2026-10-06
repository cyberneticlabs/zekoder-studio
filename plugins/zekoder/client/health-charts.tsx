import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { CodingHealthReport } from "../shared/reports.js";
import type { Aggregate, Bucket, HealthFilters } from "./health-aggregate.js";

type Theme = PluginSurfaceProps["theme"];

const NUMBER = new Intl.NumberFormat();
const TOP_LIMIT = 15;
const CHART_HEIGHT = 96;

export interface DayBar {
  day: string;
  commits: number;
  add: number;
  del: number;
}
export interface CountBar {
  label: string;
  count: number;
}
export interface PrBar {
  repo: string;
  merged: number;
  closed: number;
}

/** Per-day totals for the filtered day range (zero-filled). */
export function dailyBars(report: CodingHealthReport, agg: Aggregate, f: HealthFilters): DayBar[] {
  return report.window.days
    .slice(f.from, f.to + 1)
    .map((day, i) => ({ day, ...pick(agg.byDay[f.from + i]) }));
}

function pick(b: Bucket | undefined) {
  return { commits: b?.commits ?? 0, add: b?.add ?? 0, del: b?.del ?? 0 };
}

/** Top contributors by commits, like the web page. */
export function topContributors(report: CodingHealthReport, agg: Aggregate, limit = TOP_LIMIT): CountBar[] {
  return [...agg.byUser.entries()]
    .map(([user, b]) => ({ label: report.users[user].label, count: b.commits }))
    .filter((bar) => bar.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Merged vs closed-unmerged PRs per repo, busiest first. */
export function prsByRepo(report: CodingHealthReport, agg: Aggregate, limit = TOP_LIMIT): PrBar[] {
  return [...agg.byRepo.entries()]
    .map(([repo, b]) => ({ repo: report.repos[repo], merged: b.merged, closed: b.closed }))
    .filter((bar) => bar.merged + bar.closed > 0)
    .sort((a, b) => b.merged + b.closed - (a.merged + a.closed) || a.repo.localeCompare(b.repo))
    .slice(0, limit);
}

interface HealthChartsProps {
  theme: Theme;
  report: CodingHealthReport;
  agg: Aggregate;
  filters: HealthFilters;
}

export function HealthCharts({ theme, report, agg, filters }: HealthChartsProps) {
  const { days, people, prs } = useMemo(
    () => ({
      days: dailyBars(report, agg, filters),
      people: topContributors(report, agg),
      prs: prsByRepo(report, agg),
    }),
    [report, agg, filters],
  );
  const muted = theme.colors.foregroundMuted;
  const maxDay = Math.max(1, ...days.map((d) => d.commits));
  const maxLinesDay = Math.max(1, ...days.map((d) => d.add + d.del));
  const maxPeople = Math.max(1, ...people.map((p) => p.count));
  const maxPrs = Math.max(1, ...prs.map((p) => p.merged + p.closed));
  const first = days[0]?.day ?? report.window.start;
  const last = days[days.length - 1]?.day ?? report.window.end;
  const axis = (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 11, color: muted }}>{first}</Text>
      <Text style={{ fontSize: 11, color: muted }}>{last}</Text>
    </View>
  );

  return (
    <View style={{ gap: 20 }}>
      <ChartCard theme={theme} title="Commits per day">
        {days.every((d) => d.commits === 0) ? (
          <Empty color={muted} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: CHART_HEIGHT, gap: 1 }}>
            {days.map((d) => (
              <View
                key={d.day}
                accessible
                accessibilityLabel={`${d.day}: ${NUMBER.format(d.commits)} commits`}
                style={{
                  flex: 1,
                  minWidth: 1,
                  height: Math.max(d.commits ? 2 : 0, (d.commits / maxDay) * CHART_HEIGHT),
                  backgroundColor: theme.colors.accent,
                }}
              />
            ))}
          </View>
        )}
        {axis}
      </ChartCard>

      <ChartCard theme={theme} title="Lines added and deleted per day">
        {days.every((d) => d.add + d.del === 0) ? (
          <Empty color={muted} />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: CHART_HEIGHT, gap: 1 }}>
              {days.map((d) => (
                <View
                  key={d.day}
                  accessible
                  accessibilityLabel={`${d.day}: ${NUMBER.format(d.add)} lines added, ${NUMBER.format(d.del)} deleted`}
                  style={{ flex: 1, minWidth: 1, height: CHART_HEIGHT, justifyContent: "flex-end" }}
                >
                  <View
                    style={{
                      height: Math.max(d.del ? 1 : 0, (d.del / maxLinesDay) * CHART_HEIGHT),
                      backgroundColor: theme.colors.statusWarning,
                    }}
                  />
                  <View
                    style={{
                      height: Math.max(d.add ? 1 : 0, (d.add / maxLinesDay) * CHART_HEIGHT),
                      backgroundColor: theme.colors.accent,
                    }}
                  />
                </View>
              ))}
            </View>
            {axis}
            <Text style={{ fontSize: 11, color: muted }}>Accent added · amber deleted</Text>
          </>
        )}
      </ChartCard>

      <ChartCard theme={theme} title="Top contributors by commits">
        {people.length === 0 ? (
          <Empty color={muted} />
        ) : (
          people.map((p) => (
            <HBar
              key={p.label}
              theme={theme}
              label={p.label}
              value={NUMBER.format(p.count)}
              a={{ width: p.count / maxPeople, color: theme.colors.accent }}
              accessibility={`${p.label}: ${NUMBER.format(p.count)} commits`}
            />
          ))
        )}
      </ChartCard>

      <ChartCard theme={theme} title="Closed pull requests by repository">
        {prs.length === 0 ? (
          <Empty color={muted} />
        ) : (
          <>
            {prs.map((p) => (
              <HBar
                key={p.repo}
                theme={theme}
                label={p.repo}
                value={`${p.merged} / ${p.closed}`}
                a={{ width: p.merged / maxPrs, color: theme.colors.statusSuccess }}
                b={{ width: p.closed / maxPrs, color: theme.colors.statusWarning }}
                accessibility={`${p.repo}: ${p.merged} merged, ${p.closed} closed unmerged`}
              />
            ))}
            <Text style={{ fontSize: 11, color: muted }}>Green merged · amber closed unmerged</Text>
          </>
        )}
      </ChartCard>
    </View>
  );
}

function Empty({ color }: { color: string }) {
  return <Text style={{ fontSize: 12, color }}>No activity in this window.</Text>;
}

function ChartCard({ theme, title, children }: { theme: Theme; title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        gap: 8,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foregroundMuted }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

interface Segment {
  width: number;
  color: string;
}

function HBar(props: {
  theme: Theme;
  label: string;
  value: string;
  a: Segment;
  b?: Segment;
  accessibility: string;
}) {
  const { theme, label, value, a, b, accessibility } = props;
  const pct = (fraction: number) => `${Math.max(0, fraction) * 100}%` as const;
  return (
    <View accessible accessibilityLabel={accessibility} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text numberOfLines={1} style={{ width: 150, fontSize: 12, color: theme.colors.foreground }}>
        {label}
      </Text>
      <View style={{ flex: 1, flexDirection: "row", height: 12 }}>
        <View style={{ width: pct(a.width), backgroundColor: a.color }} />
        {b && <View style={{ width: pct(b.width), backgroundColor: b.color }} />}
      </View>
      <Text style={{ width: 80, textAlign: "right", fontSize: 12, color: theme.colors.foregroundMuted }}>{value}</Text>
    </View>
  );
}
