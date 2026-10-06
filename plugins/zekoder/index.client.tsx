import type { PluginClientContext } from "@getpaseo/plugin/client";
import { trackAgentBranchPills } from "./client/agent-branch-pills.js";
import { ConfigWorkspacePanel } from "./client/config-panel.js";
import { GitPanel } from "./client/git-panel.js";
import { GIT_PANEL_ID, trackGitTab } from "./client/git-tab.js";
import { IssuesPanel, IssuesTab } from "./client/issues-tab.js";
import { panelOpenLocation } from "./client/panel-location.js";
import { ReportsSurface } from "./client/reports-surface.js";
import { ZekoderSurface } from "./client/zekoder-surface.js";

export default function contribute(client: PluginClientContext) {
  client.addSurface("issues", IssuesTab);
  client.addSurface("reports", ReportsSurface);
  client.addSurface("zekoder", ZekoderSurface);
  client.addWorkspacePanel({
    id: "project-issues",
    title: "Zekoder issues",
    icon: "ListTodo",
    context: "workspace",
    Component: IssuesPanel,
  });
  client.addWorkspacePanel({
    id: "project-settings",
    title: "Zekoder settings",
    icon: "Settings",
    context: "workspace",
    Component: ConfigWorkspacePanel,
  });
  client.addWorkspacePanel({
    id: GIT_PANEL_ID,
    title: "Git",
    icon: "GitBranch",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: GitPanel,
  });
  // Sidebar order follows registration order: Issues, Reports, Zekoder.
  client.addSidebarItem({ id: "issues", title: "Issues", icon: "ListTodo", surface: "issues" });
  client.addSidebarItem({ id: "reports", title: "Reports", icon: "Activity", surface: "reports" });
  client.addSidebarItem({ id: "zekoder", title: "Zekoder", icon: "Settings", surface: "zekoder" });
  client.addCommandCenterItem({
    id: "open-issues",
    title: "Open Zekoder issues",
    icon: "ListTodo",
    keywords: ["zekoder", "issues", "bugs", "features", "followups", "decisions"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("issues");
    },
  });
  client.addCommandCenterItem({
    id: "open-reports",
    title: "Open Zekoder reports",
    icon: "Activity",
    keywords: ["zekoder", "reports", "coding health", "org health", "github"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("reports");
    },
  });
  client.addCommandCenterItem({
    id: "open-zekoder-settings",
    title: "Open Zekoder settings",
    icon: "Settings",
    keywords: ["zekoder", "settings", "reports", "version", "update", "defaults", "providers"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("zekoder");
    },
  });
  client.addCommandCenterItem({
    id: "open-git",
    title: "Open Git panel",
    icon: "GitBranch",
    keywords: ["git", "worktrees", "branches", "history", "graph", "commits"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel(GIT_PANEL_ID, { location: panelOpenLocation() });
    },
  });
  const stopBranchPills = trackAgentBranchPills(client);
  const stopGitTab = trackGitTab(client);
  return () => {
    stopBranchPills();
    stopGitTab();
  };
}
