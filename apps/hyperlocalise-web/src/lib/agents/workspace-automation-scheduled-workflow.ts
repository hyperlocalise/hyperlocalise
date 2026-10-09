/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  hasWorkspaceAutomationGithubAgentTool,
  hasWorkspaceAutomationGithubWorkflow,
} from "./workspace-automation-github-mapping";
import { hasWorkspaceAutomationGitlabAgentTool } from "./workspace-automation-gitlab-mapping";
import {
  hasWorkspaceAutomationContentfulWorkflow,
  hasWorkspaceAutomationCreateIssueTool,
  hasWorkspaceAutomationCrowdinTool,
  hasWorkspaceAutomationIntercomTool,
  hasWorkspaceAutomationListIssuesTool,
  hasWorkspaceAutomationWebSearchTool,
  type WorkspaceAutomationToolConfig,
} from "./workspace-automation-types";

/** A scheduled run needs a tool that produces something; delivery tools alone have nothing to send. */
export function hasWorkspaceAutomationScheduledWorkflow(
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  return (
    hasWorkspaceAutomationGithubAgentTool(toolConfig) ||
    hasWorkspaceAutomationGithubWorkflow(toolConfig) ||
    hasWorkspaceAutomationGitlabAgentTool(toolConfig) ||
    hasWorkspaceAutomationContentfulWorkflow(toolConfig) ||
    hasWorkspaceAutomationIntercomTool(toolConfig) ||
    hasWorkspaceAutomationListIssuesTool(toolConfig) ||
    hasWorkspaceAutomationCreateIssueTool(toolConfig) ||
    hasWorkspaceAutomationWebSearchTool(toolConfig) ||
    hasWorkspaceAutomationCrowdinTool(toolConfig)
  );
}
