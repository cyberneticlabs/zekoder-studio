import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSidebarCallouts } from "@/contexts/sidebar-callout-context";
import { useStableEvent } from "@/hooks/use-stable-event";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { isProvisionableStatus } from "./host-provisioning";
import { useHostZekoder, useZekoderActiveHost, zekoderHostQueryKey } from "./use-host-zekoder";

/**
 * Mounted once at the app root. Owns the catalog-change subscription for the active host and the
 * "this host lacks Zekoder" sidebar callout. Web and desktop only: the native callout slot renders null.
 */
export function ZekoderHostSource() {
  const { t } = useTranslation();
  const serverId = useZekoderActiveHost();
  const client = useHostRuntimeClient(serverId ?? "");
  const queryClient = useQueryClient();
  const callouts = useSidebarCallouts();
  const { status, provision } = useHostZekoder(serverId);
  const onProvision = useStableEvent(() => {
    void provision();
  });

  useEffect(() => {
    if (!serverId || !client) return;
    const observation = client.observeEvents(["status.plugin_catalog_changed"]);
    observation.subscribe({
      snapshot: () => {},
      update: (message) => {
        if (message.type !== "status" || message.payload.status !== "plugin_catalog_changed") {
          return;
        }
        void queryClient.invalidateQueries({ queryKey: zekoderHostQueryKey(serverId) });
      },
    });
    return () => {
      void observation
        .release()
        .catch((error) => console.warn("[Zekoder] Failed to release catalog observation", error));
    };
  }, [client, queryClient, serverId]);

  const installing = status === "install";
  const provisionable = isProvisionableStatus(status);
  useEffect(() => {
    if (!serverId || !provisionable) return;
    return callouts.show({
      id: "zekoder-host-missing",
      dismissalKey: `zekoder-host-missing:${serverId}`,
      title: t(
        installing
          ? "zekoder.hostProvisioning.callout.installTitle"
          : "zekoder.hostProvisioning.callout.enableTitle",
      ),
      description: t("zekoder.hostProvisioning.callout.description"),
      actions: [
        {
          label: t(
            installing
              ? "zekoder.hostProvisioning.actions.install"
              : "zekoder.hostProvisioning.actions.enable",
          ),
          onPress: onProvision,
          variant: "primary",
        },
      ],
      testID: "zekoder-host-missing-callout",
    });
  }, [callouts, installing, onProvision, provisionable, serverId, t]);

  return null;
}
