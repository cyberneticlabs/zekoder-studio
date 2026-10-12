import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePathname } from "expo-router";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { hostIdFromPathname } from "@/plugins/routes";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  ZEKODER_PLUGIN_ID,
  ZEKODER_PLUGIN_SOURCE,
  ZEKODER_PLUGIN_VERSION,
  isProvisionableStatus,
  resolveHostZekoderStatus,
  resolveZekoderActiveHost,
  type HostZekoderStatus,
} from "./host-provisioning";

const CATALOG_STALE_MS = 15_000;

export function zekoderHostQueryKey(serverId: string | null) {
  return ["zekoder-host", serverId] as const;
}

/** The host every Zekoder surface follows: the route's host, else the active workspace's host. */
export function useZekoderActiveHost(): string | null {
  const pathname = usePathname();
  const selection = useActiveWorkspaceSelection();
  return resolveZekoderActiveHost(hostIdFromPathname(pathname), selection?.serverId ?? null);
}

export interface HostZekoder {
  status: HostZekoderStatus;
  /** The host's plugin error when `status` is `failed`. */
  error: string | null;
  provision: () => Promise<void>;
  isProvisioning: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useHostZekoder(serverId: string | null): HostZekoder {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId ?? "");
  const connected = useHostRuntimeIsConnected(serverId ?? "");
  const pluginsSupported = useHostFeature(serverId, "plugins");
  // COMPAT(pluginSourceInstallation): added in v0.8.0; remove gate after 2027-03-16 once daemon floor supports source identifiers.
  const sourceInstallSupported = useHostFeature(serverId, "pluginSourceInstallation");
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const queryKey = useMemo(() => zekoderHostQueryKey(serverId), [serverId]);

  const query = useFetchQuery({
    queryKey,
    enabled: Boolean(serverId && client && connected && pluginsSupported),
    dataShape: "value",
    staleTimeMs: CATALOG_STALE_MS,
    queryFn: async () => {
      if (!client) throw new Error("Host client unavailable");
      const [catalog, installed] = await Promise.all([
        client.getPluginCatalog(),
        client.listPlugins(),
      ]);
      return { catalogPluginIds: catalog.map((plugin) => plugin.id), installed };
    },
  });

  const pluginsEnabled = config ? config.pluginsEnabled === true : null;
  const status = resolveHostZekoderStatus({
    connected,
    pluginsSupported,
    sourceInstallSupported,
    catalogPluginIds: query.data?.catalogPluginIds ?? null,
    installed: query.data?.installed ?? null,
    pluginsEnabled,
  });
  const error = useMemo(
    () =>
      status === "failed"
        ? (query.data?.installed.find((plugin) => plugin.id === ZEKODER_PLUGIN_ID)?.error ?? null)
        : null,
    [query.data, status],
  );

  const provision = useCallback(async () => {
    if (!client || !isProvisionableStatus(status) || isProvisioning) return;
    const turnsOnPlugins = pluginsEnabled !== true;
    const installing = status === "install";
    const confirmed = await confirmDialog({
      title: t(
        installing
          ? "zekoder.hostProvisioning.consent.installTitle"
          : "zekoder.hostProvisioning.consent.enableTitle",
      ),
      message: [
        t(
          installing
            ? "zekoder.hostProvisioning.consent.installMessage"
            : "zekoder.hostProvisioning.consent.enableMessage",
          { source: ZEKODER_PLUGIN_SOURCE },
        ),
        turnsOnPlugins ? t("zekoder.hostProvisioning.consent.pluginsNotice") : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      confirmLabel: t(
        installing
          ? "zekoder.hostProvisioning.actions.install"
          : "zekoder.hostProvisioning.actions.enable",
      ),
    });
    if (!confirmed) return;
    setIsProvisioning(true);
    try {
      if (installing) {
        await client.installPluginSource({ source: ZEKODER_PLUGIN_SOURCE, id: ZEKODER_PLUGIN_ID });
      } else if (status === "enable-plugin") {
        await client.enablePlugin(ZEKODER_PLUGIN_ID);
      }
      if (turnsOnPlugins) await patchConfig({ pluginsEnabled: true });
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      toast.error(
        t("zekoder.hostProvisioning.errors.failed", {
          version: ZEKODER_PLUGIN_VERSION,
          message: errorMessage(cause),
        }),
      );
    } finally {
      setIsProvisioning(false);
    }
  }, [
    client,
    isProvisioning,
    patchConfig,
    pluginsEnabled,
    queryClient,
    queryKey,
    status,
    t,
    toast,
  ]);

  return { status, error, provision, isProvisioning };
}
