import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { panelOpenLocation } from "./panel-location.js";

export const GIT_PANEL_ID = "git";
const WORKSPACE_PAGE_SIZE = 100;

type WorkspaceLike = { id: string; projectKind: string; archivingAt?: string | null };

/**
 * Puts a Git button in every git workspace's header that opens the Git tab in the right panel (or in
 * the main pane on compact layouts). Paseo never adds plugin tabs to the right panel by itself, and
 * its "Open in" menu (editors, GitHub, Finder) takes no plugin entries, so the header is the visible
 * way in.
 */
export function trackGitTab(client: PluginClientContext): () => void {
  const buttons = new Map<string, PluginButtonRegistration>();
  let disposed = false;

  const open = (workspaceId: string) =>
    client.openPanel(GIT_PANEL_ID, { workspaceId, location: panelOpenLocation() });

  function upsert(workspace: WorkspaceLike): void {
    if (disposed) return;
    if (workspace.archivingAt || workspace.projectKind !== "git") return remove(workspace.id);
    if (buttons.has(workspace.id)) return;
    buttons.set(
      workspace.id,
      client.addHeaderButton({
        // Paseo button ids must match /^[a-z][a-z0-9-]*$/; workspace ids look like `wks_9e00…`.
        id: `git-${workspace.id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
        workspaceId: workspace.id,
        button: {
          title: "Open Git panel",
          icon: "GitBranch",
          behavior: { kind: "action", onPress: () => open(workspace.id) },
        },
      }),
    );
  }

  function upsertAll(workspaces: WorkspaceLike[]): void {
    for (const workspace of workspaces) {
      try {
        upsert(workspace);
      } catch (error) {
        console.warn("[zekoder] git header button failed", error);
      }
    }
  }

  function remove(workspaceId: string): void {
    buttons.get(workspaceId)?.remove();
    buttons.delete(workspaceId);
  }

  const unsubscribe = client.paseo.workspaces.subscribe((update) => {
    try {
      if (update.kind === "upsert") upsert(update.workspace);
      else remove(update.id);
    } catch (error) {
      console.warn("[zekoder] git header button failed", error);
    }
  });
  let release: (() => Promise<void>) | null = null;
  client.paseo.workspaces
    .list({ subscribe: {} })
    .then(async ({ entries, subscription, pageInfo }) => {
      release = () => subscription.release();
      if (disposed) return void release().catch(() => {});
      upsertAll(entries);
      // The subscription only reports changes; later pages must be fetched to cover every workspace.
      for (let cursor = pageInfo.hasMore ? pageInfo.nextCursor : null; cursor && !disposed; ) {
        const page = await client.paseo.workspaces.list({ page: { limit: WORKSPACE_PAGE_SIZE, cursor } });
        upsertAll(page.entries);
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
      }
    })
    .catch((error) => console.warn("[zekoder] workspace list failed", error));

  return () => {
    disposed = true;
    unsubscribe();
    void release?.().catch(() => {});
    buttons.forEach((button) => button.remove());
    buttons.clear();
  };
}
