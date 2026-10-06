import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { agentBranchRpc } from "../shared/branch.js";
import { GIT_PANEL_ID } from "./git-tab.js";
import { panelOpenLocation } from "./panel-location.js";

/** Agent updates arrive on every streamed event; the branch only needs re-reading now and then. */
const REFRESH_MIN_MS = 5_000;

type Tracked = { pill: PluginButtonRegistration; cwd: string; refreshedAt: number; busy: boolean };

/**
 * Keeps one composer pill per agent in a zekoder project, labelled with the branch its cwd is on.
 * Pills for agents elsewhere stay hidden. Pressing a pill opens the Git tab (right panel, or main pane on compact
 * layouts) and re-reads the branch.
 */
export function trackAgentBranchPills(client: PluginClientContext): () => void {
  const tracked = new Map<string, Tracked>();
  let disposed = false;

  async function refresh(entry: Tracked): Promise<void> {
    if (entry.busy) return;
    entry.busy = true;
    entry.refreshedAt = Date.now();
    try {
      const { zekoder, branch } = await client.rpc(agentBranchRpc, { cwd: entry.cwd });
      if (disposed) return;
      entry.pill.update(
        zekoder && branch
          ? { visible: true, label: branch, title: `Agent branch: ${branch} — open Git panel` }
          : { visible: false },
      );
    } catch (error) {
      console.warn("[zekoder] agent branch lookup failed", error);
      if (!disposed) entry.pill.update({ visible: false });
    } finally {
      entry.busy = false;
    }
  }

  function upsert(agent: { id: string; cwd: string; workspaceId?: string; archivedAt?: string | null }): void {
    if (disposed || !agent.workspaceId) return;
    const known = tracked.get(agent.id);
    if (agent.archivedAt) return remove(agent.id);
    if (known && known.cwd === agent.cwd) {
      if (Date.now() - known.refreshedAt >= REFRESH_MIN_MS) void refresh(known);
      return;
    }
    known?.pill.remove();
    const workspaceId = agent.workspaceId;
    const entry: Tracked = {
      cwd: agent.cwd,
      refreshedAt: 0,
      busy: false,
      pill: client.addComposerPill({
        id: `branch-${agent.id}`,
        workspaceId,
        agentId: agent.id,
        button: {
          title: "Agent branch",
          icon: "GitBranch",
          label: "…",
          visible: false,
          behavior: {
            kind: "action",
            onPress: () => {
              client.openPanel(GIT_PANEL_ID, { workspaceId, location: panelOpenLocation() });
              return refresh(entry);
            },
          },
        },
      }),
    };
    tracked.set(agent.id, entry);
    void refresh(entry);
  }

  function remove(agentId: string): void {
    tracked.get(agentId)?.pill.remove();
    tracked.delete(agentId);
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    try {
      if (update.kind === "upsert") upsert(update.agent);
      else remove(update.agentId);
    } catch (error) {
      console.warn("[zekoder] agent branch pill failed", error);
    }
  });
  let release: (() => Promise<void>) | null = null;
  client.paseo.agents
    .list({ subscribe: {} })
    .then(({ entries, subscription }) => {
      release = () => subscription.release();
      if (disposed) return void release().catch(() => {});
      for (const { agent } of entries) {
        try {
          upsert(agent);
        } catch (error) {
          console.warn("[zekoder] agent branch pill failed", error);
        }
      }
    })
    .catch((error) => console.warn("[zekoder] agent list failed", error));

  return () => {
    disposed = true;
    unsubscribe();
    void release?.().catch(() => {});
    tracked.forEach((entry) => entry.pill.remove());
    tracked.clear();
  };
}
