import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  RELEASE_CHANNELS,
  VERSION_POLL_MS,
  checkVersionRpc,
  updateProjectRpc,
  versionSettings,
  versionStatusRpc,
  type ProjectVersion,
  type ReleaseChannel,
  type TargetVersion,
  type VersionStatus,
} from "../shared/version.js";
import { errorText } from "../shared/errors.js";
import { Button } from "./button.js";
import { Chip } from "./chip.js";

type Theme = PluginSurfaceProps["theme"];

/** Shared with the surface's tab dot, so both read one cached status. */
export const VERSION_STATUS_KEY = ["zekoder", "version"];
const JOB_POLL_MS = 2000;

export function hasFailedInstall(status: VersionStatus | undefined): boolean {
  return (status?.projects ?? []).some((project) =>
    [project, ...project.worktrees].some((target) => target.job?.status === "failed"),
  );
}

function hasActiveInstall(status: VersionStatus | undefined): boolean {
  return (status?.projects ?? []).some((project) =>
    [project, ...project.worktrees].some((target) => target.job?.status === "queued" || target.job?.status === "running"),
  );
}

export function VersionPanel({ theme }: { theme: Theme }) {
  const queryClient = useQueryClient();
  const fetchStatus = useRpc(versionStatusRpc);
  const check = useRpc(checkVersionRpc);
  const update = useRpc(updateProjectRpc);

  const status = useQuery({
    queryKey: VERSION_STATUS_KEY,
    queryFn: () => fetchStatus({}),
    // Poll fast only while an install runs, so its log and result show up promptly.
    refetchInterval: (query) => (hasActiveInstall(query.state.data) ? JOB_POLL_MS : VERSION_POLL_MS),
  });
  const setStatus = (data: VersionStatus) => queryClient.setQueryData(VERSION_STATUS_KEY, data);
  const checkNow = useMutation({ mutationFn: () => check({}), onSuccess: setStatus });
  const retry = useMutation({
    mutationFn: (dir: string) => update({ root: dir }),
    onSuccess: setStatus,
  });
  const settings = useSettings(versionSettings);
  const switchChannel = useMutation({
    mutationFn: async (next: ReleaseChannel) => {
      if (settings.status !== "ready" && settings.status !== "invalid") throw new Error("Settings are still loading.");
      if (!(await settings.save({ channel: next }, settings.revision))) {
        throw new Error(settings.saveError ?? "Could not save the channel.");
      }
      return check({});
    },
    onSuccess: setStatus,
  });
  const selectedChannel = switchChannel.isPending
    ? switchChannel.variables
    : settings.status === "ready"
      ? settings.values.channel
      : "stable";

  const data = status.data;
  const muted = { color: theme.colors.foregroundMuted };
  const checking = checkNow.isPending || data?.checking;

  return (
    <ScrollView contentContainerStyle={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: theme.colors.foreground }}>
            Latest version: {data?.latest ?? "unknown"}
          </Text>
          <Button
            theme={theme}
            icon="RefreshCw"
            label={checking ? "Checking…" : "Check now"}
            disabled={!!checking}
            onPress={() => checkNow.mutate()}
          />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 12, ...muted }}>Channel:</Text>
          {RELEASE_CHANNELS.map((option) => (
            <Chip
              key={option}
              theme={theme}
              label={option}
              selected={selectedChannel === option}
              onPress={() => option !== selectedChannel && !switchChannel.isPending && switchChannel.mutate(option)}
            />
          ))}
        </View>
        {data?.source && data.source !== data.channel && (
          <Text style={{ fontSize: 12, color: theme.colors.statusWarning }}>
            Stable has no release yet, so the latest dev release is used.
          </Text>
        )}
        <Text style={{ fontSize: 12, ...muted }}>
          {data?.checkedAt ? `Last checked ${new Date(data.checkedAt).toLocaleString()}` : "Not checked yet"}
          {data ? ` · checks every ${data.intervalMinutes / 60} h` : ""}
        </Text>
        <Text style={{ fontSize: 12, ...muted }}>
          Zekoder is installed and updated automatically in every Paseo project and its worktrees.
        </Text>
        {data?.error && <Text style={{ color: theme.colors.statusDanger }}>{data.error}</Text>}
        {status.isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(status.error)}</Text>}
        {checkNow.isError && (
          <Text style={{ color: theme.colors.statusDanger }}>{errorText(checkNow.error)}</Text>
        )}
        {switchChannel.isError && (
          <Text style={{ color: theme.colors.statusDanger }}>{errorText(switchChannel.error)}</Text>
        )}
        {retry.isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(retry.error)}</Text>}
      </View>

      {data?.projects.length === 0 && <Text style={muted}>No Paseo projects yet.</Text>}
      {data?.projects.map((project) => (
        <ProjectVersionCard
          key={project.root}
          theme={theme}
          project={project}
          retrying={retry.isPending ? retry.variables : undefined}
          onRetry={(dir) => retry.mutate(dir)}
        />
      ))}
    </ScrollView>
  );
}

interface ProjectVersionCardProps {
  theme: Theme;
  project: ProjectVersion;
  retrying: string | undefined;
  onRetry(dir: string): void;
}

function ProjectVersionCard({ theme, project, retrying, onRetry }: ProjectVersionCardProps) {
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
      <Text style={{ fontWeight: "600", color: theme.colors.foreground }}>{project.name}</Text>
      <TargetRow theme={theme} target={project} retrying={retrying === project.dir} onRetry={onRetry} />
      {project.worktrees.map((worktree) => (
        <TargetRow
          key={worktree.dir}
          theme={theme}
          target={worktree}
          retrying={retrying === worktree.dir}
          onRetry={onRetry}
        />
      ))}
    </View>
  );
}

interface TargetRowProps {
  theme: Theme;
  target: TargetVersion;
  retrying: boolean;
  onRetry(dir: string): void;
}

function TargetRow({ theme, target, retrying, onRetry }: TargetRowProps) {
  const [showLog, setShowLog] = useState(false);
  const { job } = target;
  const active = job?.status === "queued" || job?.status === "running";
  const muted = { color: theme.colors.foregroundMuted };

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 12, ...muted }}>{target.dir}</Text>
          <Text style={{ fontSize: 12, color: theme.colors.foreground }}>
            Installed: {target.installed ?? "not yet"}
            {target.outdated && !active ? (
              <Text style={{ color: theme.colors.statusWarning }}> · waiting for install</Text>
            ) : null}
          </Text>
        </View>
        {job?.status === "failed" && (
          <Button
            theme={theme}
            icon="RefreshCw"
            label={retrying ? "Retrying…" : "Retry"}
            disabled={retrying}
            onPress={() => onRetry(target.dir)}
          />
        )}
      </View>

      {job && (
        <View style={{ gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showLog ? "Hide install log" : "Show install log"}
            onPress={() => setShowLog((open) => !open)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon name={showLog ? "ChevronDown" : "ChevronRight"} size={14} color={muted.color} />
            <Text style={{ fontSize: 12, color: jobColor(job.status, theme) }}>
              {job.status === "queued"
                ? "Install queued…"
                : job.status === "running"
                  ? "Installing…"
                  : `Install ${job.status} · ${new Date(job.finishedAt ?? job.startedAt).toLocaleString()}`}
            </Text>
          </Pressable>
          {job.status === "succeeded" && (
            <Text style={{ fontSize: 12, ...muted }}>
              Agents started before this install: Claude /mcp reconnect zekoder, then /zekoder-migrate.
              Codex: restart, then $zekoder-migrate.
            </Text>
          )}
          {showLog && (
            <ScrollView
              style={{ maxHeight: 240, borderRadius: 6, backgroundColor: theme.colors.surface0 }}
              contentContainerStyle={{ padding: 8 }}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 11, color: theme.colors.foreground }}>
                {job.log || "(no output yet)"}
              </Text>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function jobColor(status: string, theme: Theme): string {
  if (status === "succeeded") return theme.colors.statusSuccess;
  if (status === "failed") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}
