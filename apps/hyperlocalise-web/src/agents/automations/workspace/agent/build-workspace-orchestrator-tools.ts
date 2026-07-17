import type { ToolSet } from "ai";

import type { WorkspaceOrchestratorSession } from "./context";
import type { WorkspaceOrchestratorToolName } from "./plan";
import { createAssignTranslateWithAgentTool } from "./tools/assign_translate_with_agent";
import { createNativeTmsJobTool } from "./tools/create_native_tms_job";
import { createNotifyEmailTool } from "./tools/notify_email";
import { createNotifySlackTool } from "./tools/notify_slack";
import { createRunContentfulTranslationTool } from "./tools/run_contentful_translation";
import { createRunGithubWorkflowsTool } from "./tools/run_github_workflows";
import { createUseGithubRepositoryTool } from "./tools/use_github_repository";

const TOOL_BUILDERS: Record<
  WorkspaceOrchestratorToolName,
  (session: WorkspaceOrchestratorSession) => ToolSet[string]
> = {
  use_github_repository: createUseGithubRepositoryTool,
  run_github_workflows: createRunGithubWorkflowsTool,
  run_contentful_translation: createRunContentfulTranslationTool,
  create_native_tms_job: createNativeTmsJobTool,
  assign_translate_with_agent: createAssignTranslateWithAgentTool,
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
