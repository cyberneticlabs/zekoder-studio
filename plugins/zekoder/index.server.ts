import type { PluginServerContext } from "@getpaseo/plugin/server";
import { agentBranch } from "./server/branch.js";
import { getConfig, getMachineDefaults, listHarnessModels, listProviders, setConfig, setMachineDefaults } from "./server/config.js";
import { gitOverview } from "./server/git.js";
import { disposeReportServer } from "./server/report-server.js";
import { collectReport, getCodingHealth, listOrgs, openReport, validateOrg } from "./server/reports.js";
import { cleanupRoleVariants } from "./server/role-variants.js";
import { getTelemetry, setTelemetry } from "./server/telemetry.js";
import {
  checkVersion,
  installBeforeAgent,
  installForWorkspace,
  scheduleVersionChecks,
  updateProject,
  versionStatus,
} from "./server/version.js";
import { disposeClients, getIssue, implementIssue, listIssues, listProjects, migrateWorkspace, promoteIdea, readDoc } from "./server/zekoder.js";
import { agentBranchRpc } from "./shared/branch.js";
import {
  getConfigRpc,
  getMachineDefaultsRpc,
  listHarnessModelsRpc,
  listProvidersRpc,
  setConfigRpc,
  setMachineDefaultsRpc,
} from "./shared/config.js";
import { gitOverviewRpc } from "./shared/git.js";
import {
  getIssueRpc,
  implementIssueRpc,
  issueFiltersSettings,
  listIssuesRpc,
  listProjectsRpc,
  migrateWorkspaceRpc,
  promoteIdeaRpc,
  readDocRpc,
} from "./shared/issues.js";
import { codingHealthRpc, collectReportRpc, listOrgsRpc, openReportRpc, reportSettings, validateOrgRpc } from "./shared/reports.js";
import { getTelemetryRpc, setTelemetryRpc } from "./shared/telemetry.js";
import { checkVersionRpc, updateProjectRpc, versionSettings, versionStatusRpc } from "./shared/version.js";

export default function contribute(server: PluginServerContext) {
  server.handle(listProjectsRpc, listProjects);
  server.handle(listIssuesRpc, listIssues);
  server.handle(getIssueRpc, getIssue);
  server.handle(readDocRpc, readDoc);
  server.handle(implementIssueRpc, implementIssue);
  server.handle(promoteIdeaRpc, promoteIdea);
  server.handle(migrateWorkspaceRpc, migrateWorkspace);
  server.handle(versionStatusRpc, versionStatus);
  server.handle(checkVersionRpc, checkVersion);
  server.handle(updateProjectRpc, updateProject);
  server.handle(getConfigRpc, getConfig);
  server.handle(setConfigRpc, setConfig);
  server.handle(getMachineDefaultsRpc, getMachineDefaults);
  server.handle(setMachineDefaultsRpc, setMachineDefaults);
  server.handle(getTelemetryRpc, getTelemetry);
  server.handle(setTelemetryRpc, setTelemetry);
  server.handle(listHarnessModelsRpc, listHarnessModels);
  server.handle(listProvidersRpc, listProviders);
  server.handle(validateOrgRpc, validateOrg);
  server.handle(codingHealthRpc, getCodingHealth);
  server.handle(collectReportRpc, collectReport);
  server.handle(listOrgsRpc, listOrgs);
  server.handle(openReportRpc, openReport);
  server.handle(agentBranchRpc, agentBranch);
  server.handle(gitOverviewRpc, gitOverview);
  server.on("workspace.archived", cleanupRoleVariants);
  server.on("workspace.created", installForWorkspace);
  server.before("agent.create", installBeforeAgent);
  server.registerSettings(issueFiltersSettings);
  server.registerSettings(reportSettings);
  const stopVersionChecks = scheduleVersionChecks(server.registerSettings(versionSettings));
  return () => {
    stopVersionChecks();
    disposeClients();
    disposeReportServer();
  };
}
