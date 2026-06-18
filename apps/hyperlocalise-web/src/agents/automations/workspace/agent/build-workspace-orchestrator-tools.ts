import type { ToolSet } from "ai";

import type { WorkspaceOrchestratorSession } from "./context";
import type { WorkspaceOrchestratorToolName } from "./plan";
import { createNotifyEmailTool } from "./tools/notify_email";
import { createNotifySlackTool } from "./tools/notify_slack";
import { createRunContentfulTranslationTool } from "./tools/run_contentful_translation";
import { createRunGithubWorkflowsTool } from "./tools/run_github_workflows";

const TOOL_BUILDERS: Record<
  WorkspaceOrchestratorToolName,
  (session: WorkspaceOrchestratorSession) => ToolSet[string]
> = {
  run_github_workflows: createRunGithubWorkflowsTool,
  run_contentful_translation: createRunContentfulTranslationTool,
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
