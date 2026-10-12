import { router, usePathname } from "expo-router";
import { useCallback } from "react";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { resolvePluginIcon } from "@/plugins/icons";
import { buildPluginSurfaceRoute } from "@/plugins/routes";
import type { PluginSidebarGroup } from "@/plugins/sidebar-groups";
import { LegacyPluginSidebarRow } from "@/plugins/sidebar-items/legacy";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import {
  ZEKODER_PLACEHOLDER_ITEMS,
  ZEKODER_PLUGIN_ID,
  shouldShowZekoderPlaceholders,
} from "./host-provisioning";
import { useHostZekoder, useZekoderActiveHost } from "./use-host-zekoder";

type LegacyGroup = Extract<PluginSidebarGroup, { kind: "legacy" }>;

interface ZekoderRowProps {
  onBeforeNavigate?: () => void;
}

function ZekoderRow({
  serverId,
  itemId,
  title,
  icon,
  testID,
  onBeforeNavigate,
}: ZekoderRowProps & {
  serverId: string;
  itemId: string;
  title: string;
  icon: string;
  testID: string;
}) {
  const pathname = usePathname();
  const route = buildPluginSurfaceRoute(serverId, ZEKODER_PLUGIN_ID, {
    kind: "sidebar",
    id: itemId,
  });
  const navigate = useCallback(() => {
    onBeforeNavigate?.();
    router.push(route);
  }, [onBeforeNavigate, route]);
  return (
    <SidebarHeaderRow
      icon={resolvePluginIcon(icon)}
      label={title}
      onPress={navigate}
      isActive={pathname === route}
      testID={testID}
      variant="compact"
    />
  );
}

/**
 * Replaces the legacy row for the Zekoder plugin: it always opens the active host's Zekoder
 * (or the install empty state when that host lacks it), never another host's.
 */
export function ZekoderSidebarRow({
  group,
  onBeforeNavigate,
}: ZekoderRowProps & { group: LegacyGroup }) {
  const serverId = useZekoderActiveHost();
  if (!serverId)
    return <LegacyPluginSidebarRow group={group} onBeforeNavigate={onBeforeNavigate} />;
  return (
    <ZekoderRow
      serverId={serverId}
      itemId={group.contributionId}
      title={group.title}
      icon={group.icon}
      testID={`plugin-sidebar-${group.pluginId}-${group.contributionId}`}
      onBeforeNavigate={onBeforeNavigate}
    />
  );
}

/** Rows shown when no connected host contributes Zekoder and the active host lacks it. */
export function ZekoderPlaceholderRows({ onBeforeNavigate }: ZekoderRowProps) {
  const serverId = useZekoderActiveHost();
  const { status } = useHostZekoder(serverId);
  const { items } = useSidebarNavItems("header");
  const hasZekoderGroup = items.some(
    (item) => item.kind === "plugin" && item.group.pluginId === ZEKODER_PLUGIN_ID,
  );
  if (!serverId || !shouldShowZekoderPlaceholders(hasZekoderGroup, status)) return null;
  return (
    <>
      {ZEKODER_PLACEHOLDER_ITEMS.map((item) => (
        <ZekoderRow
          key={item.id}
          serverId={serverId}
          itemId={item.id}
          title={item.title}
          icon={item.icon}
          testID={`zekoder-placeholder-${item.id}`}
          onBeforeNavigate={onBeforeNavigate}
        />
      ))}
    </>
  );
}
