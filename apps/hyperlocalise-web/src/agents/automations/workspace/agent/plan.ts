import {
  hasWorkspaceAutomationGithubAgentTool,
  hasWorkspaceAutomationGithubWorkflow,
} from "@/lib/agents/workspace-automation-github-mapping";
import {
  hasWorkspaceAutomationContentfulWorkflow,
  hasWorkspaceAutomationTranslationWorkflow,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationToolConfig,
} from "@/lib/agents/workspace-automations";

import { getTemplateExecutorAgent } from "./workspace-template-manifest";

export const WORKSPACE_ORCHESTRATOR_TOOL_NAMES = [
  "use_github_repository",
  "run_github_workflows",
  "run_contentful_translation",
  "create_translation_jobs",
  "notify_slack",
  "notify_email",
] as const;

export type WorkspaceOrchestratorToolName = (typeof WORKSPACE_ORCHESTRATOR_TOOL_NAMES)[number];

export type WorkspaceOrchestratorPlan = {
  tools: WorkspaceOrchestratorToolName[];
};

export type WorkspaceOrchestratorTriggerContext = {
  templateSkillId?: string | null;
};

const WORKFLOW_TOOLS: WorkspaceOrchestratorToolName[] = [
  "use_github_repository",
  "run_github_workflows",
  "run_contentful_translation",
  "create_translation_jobs",
];

const NOTIFICATION_TOOLS: WorkspaceOrchestratorToolName[] = ["notify_slack", "notify_email"];

function workflowToolEnabled(
  tool: WorkspaceOrchestratorToolName,
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  switch (tool) {
    case "use_github_repository":
      return hasWorkspaceAutomationGithubAgentTool(toolConfig);
    case "run_github_workflows":
      return hasWorkspaceAutomationGithubWorkflow(toolConfig);
    case "run_contentful_translation":
      return hasWorkspaceAutomationContentfulWorkflow(toolConfig);
    case "create_translation_jobs":
      return hasWorkspaceAutomationTranslationWorkflow(toolConfig);
    default:
      return false;
  }
}

function notificationToolEnabled(
  tool: WorkspaceOrchestratorToolName,
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  switch (tool) {
    case "notify_slack":
      return Boolean(toolConfig.slack?.enabled && toolConfig.slack.channelId);
    case "notify_email":
      return Boolean(
        toolConfig.email?.enabled &&
        toolConfig.email.recipients &&
        toolConfig.email.recipients.length > 0,
      );
    default:
      return false;
  }
}

function orderWorkflowTools(input: {
  toolConfig: WorkspaceAutomationToolConfig;
  templateSkillId?: string | null;
}): WorkspaceOrchestratorToolName[] {
  const enabled = WORKFLOW_TOOLS.filter((tool) => workflowToolEnabled(tool, input.toolConfig));
  if (enabled.length <= 1) {
    return enabled;
  }

  const executorAgent = input.templateSkillId
    ? getTemplateExecutorAgent(input.templateSkillId)
    : null;

  if (executorAgent === "contentful") {
    return [
      ...enabled.filter((tool) => tool === "run_contentful_translation"),
      ...enabled.filter((tool) => tool === "run_github_workflows"),
      ...enabled.filter((tool) => tool === "use_github_repository"),
    ];
  }

  return [
    ...enabled.filter((tool) => tool === "use_github_repository"),
    ...enabled.filter((tool) => tool === "run_github_workflows"),
    ...enabled.filter((tool) => tool === "run_contentful_translation"),
  ];
}

export function buildWorkspaceOrchestratorPlan(
  automation: WorkspaceAutomationRecord,
  triggerContext?: WorkspaceOrchestratorTriggerContext,
): WorkspaceOrchestratorPlan {
  const workflowTools = orderWorkflowTools({
    toolConfig: automation.toolConfig,
    templateSkillId: triggerContext?.templateSkillId,
  });
  const notificationTools = NOTIFICATION_TOOLS.filter((tool) =>
    notificationToolEnabled(tool, automation.toolConfig),
  );

  return {
    tools: [...workflowTools, ...notificationTools],
  };
}
