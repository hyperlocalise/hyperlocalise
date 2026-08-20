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
import { createCreateIssueTool } from "./tools/create_issue";
import { createNativeTmsJobTool } from "./tools/create_native_tms_job";
import { createListIssuesTool } from "./tools/list_issues";
import { createNotifyEmailTool } from "./tools/notify_email";
import { createNotifyGithubCommentTool } from "./tools/notify_github_comment";
import { createNotifySlackTool } from "./tools/notify_slack";
import { createRecallMemoryTool } from "./tools/recall_memory";
import { createRunContentfulTranslationTool } from "./tools/run_contentful_translation";
import { createRunGithubWorkflowsTool } from "./tools/run_github_workflows";
import { createSaveMemoryTool } from "./tools/save_memory";
import { createUseAhrefsTool } from "./tools/use_ahrefs";
import { createUseCrowdinTool } from "./tools/use_crowdin";
import { createUseGithubRepositoryTool } from "./tools/use_github_repository";
import { createUseSemrushTool } from "./tools/use_semrush";
import { createUseWebSearchTool } from "./tools/use_web_search";

const TOOL_BUILDERS: Record<
  WorkspaceOrchestratorToolName,
  (session: WorkspaceOrchestratorSession) => ToolSet[string]
> = {
  use_github_repository: createUseGithubRepositoryTool,
  run_github_workflows: createRunGithubWorkflowsTool,
  run_contentful_translation: createRunContentfulTranslationTool,
  create_native_tms_job: createNativeTmsJobTool,
  assign_translate_with_agent: createAssignTranslateWithAgentTool,
  list_issues: createListIssuesTool,
  create_issue: createCreateIssueTool,
  use_crowdin: createUseCrowdinTool,
  use_semrush: createUseSemrushTool,
  use_ahrefs: createUseAhrefsTool,
  use_web_search: createUseWebSearchTool,
  notify_slack: createNotifySlackTool,
  notify_email: createNotifyEmailTool,
  notify_github_comment: createNotifyGithubCommentTool,
  recall_memory: createRecallMemoryTool,
  save_memory: createSaveMemoryTool,
};

export function buildWorkspaceOrchestratorTools(session: WorkspaceOrchestratorSession): ToolSet {
  const tools: ToolSet = {};

  for (const toolName of session.plan.tools) {
    tools[toolName] = TOOL_BUILDERS[toolName](session);
  }

  return tools;
}
