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
import type { ToolSet } from "ai";

import type { WorkspaceOrchestratorSession } from "./context";
import type { WorkspaceOrchestratorToolName } from "./plan";
import { createAssignTranslateWithAgentTool } from "./tools/assign_translate_with_agent";
import { createNativeTmsJobTool } from "./tools/create_native_tms_job";
import { createNotifyEmailTool } from "./tools/notify_email";
import { createNotifySlackTool } from "./tools/notify_slack";
import { createRunContentfulTranslationTool } from "./tools/run_contentful_translation";
import { createRunGithubWorkflowsTool } from "./tools/run_github_workflows";
import { createUseAhrefsTool } from "./tools/use_ahrefs";
import { createUseGithubRepositoryTool } from "./tools/use_github_repository";
import { createUseSemrushTool } from "./tools/use_semrush";

const TOOL_BUILDERS: Record<
  WorkspaceOrchestratorToolName,
  (session: WorkspaceOrchestratorSession) => ToolSet[string]
> = {
  use_github_repository: createUseGithubRepositoryTool,
  run_github_workflows: createRunGithubWorkflowsTool,
  run_contentful_translation: createRunContentfulTranslationTool,
  create_native_tms_job: createNativeTmsJobTool,
  assign_translate_with_agent: createAssignTranslateWithAgentTool,
  use_semrush: createUseSemrushTool,
  use_ahrefs: createUseAhrefsTool,
  notify_slack: createNotifySlackTool,
  notify_email: createNotifyEmailTool,
};

export function buildWorkspaceOrchestratorTools(session: WorkspaceOrchestratorSession): ToolSet {
  const tools: ToolSet = {};

  for (const toolName of session.plan.tools) {
    tools[toolName] = TOOL_BUILDERS[toolName](session);
  }

  return tools;
}
