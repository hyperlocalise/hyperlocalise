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
} from "@/lib/agents/workspace-automation-github-mapping";
import {
  hasWorkspaceAutomationAssignTranslateWithAgentTool,
  hasWorkspaceAutomationContentfulWorkflow,
  hasWorkspaceAutomationCreateNativeTmsJobTool,
  hasWorkspaceAutomationKnowledgeTool,
  hasWorkspaceAutomationKnowledgeUpdatesAllowed,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationToolConfig,
} from "@/lib/agents/workspace-automations";

import { getTemplateExecutorAgent } from "./workspace-template-manifest";

export const WORKSPACE_ORCHESTRATOR_TOOL_NAMES = [
  "use_github_repository",
  "run_github_workflows",
  "run_contentful_translation",
  "create_native_tms_job",
  "assign_translate_with_agent",
  "use_semrush",
  "use_ahrefs",
  "notify_slack",
  "notify_email",
  "recall_memory",
  "save_memory",
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
  "create_native_tms_job",
  "assign_translate_with_agent",
  "use_semrush",
  "use_ahrefs",
];

const NOTIFICATION_TOOLS: WorkspaceOrchestratorToolName[] = ["notify_slack", "notify_email"];

// Not part of WORKFLOW_TOOLS: memory tools are general availability, not ordered workflow steps,
// so they skip orderWorkflowTools' template-skill-executor reordering entirely.
//
// save_memory is forced (not offered as an "auto" step) rather than grouped into MEMORY_TOOLS
// below: forcing every planned tool via toolChoice ({type:"tool",...}) is the only way agent.ts's
// ToolLoopAgent reliably reaches the tools planned after it — the underlying loop only continues
// past a step that produced zero tool calls, so a toolChoice: "auto" step risked the model ending
// the run before a later forced notification tool ever ran (a real Codex finding against an
// earlier version of this file). It's still not "invented content on every run" per the
// *original* finding against forcing it: its schema accepts entry: null as an explicit "nothing
// to remember" decision.
const MEMORY_TOOLS: WorkspaceOrchestratorToolName[] = ["recall_memory"];
const SAVE_MEMORY_TOOLS: WorkspaceOrchestratorToolName[] = ["save_memory"];
// Both memory tools together, used only by planHasActionableTool: whether save_memory actually
// writes anything is entirely the model's call (it can always return entry: null), so a plan
// offering only recall_memory and/or save_memory isn't a guaranteed real effect the way a
// workflow or notification tool is. workspaceAutomationFormCanActivate already excludes Memory
// (both directions) from the set of tools that make an automation activatable in the UI; treating
// save_memory as actionable here would let dispatchManualWorkspaceAutomationRun accept and bill a
// run the UI itself wouldn't have allowed the automation to be created with in the first place.
const MEMORY_ONLY_TOOLS: WorkspaceOrchestratorToolName[] = [...MEMORY_TOOLS, ...SAVE_MEMORY_TOOLS];

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
    case "create_native_tms_job":
      return hasWorkspaceAutomationCreateNativeTmsJobTool(toolConfig);
    case "assign_translate_with_agent":
      return hasWorkspaceAutomationAssignTranslateWithAgentTool(toolConfig);
    case "use_semrush":
      return Boolean(toolConfig.semrush?.enabled && toolConfig.semrush.connectionId);
    case "use_ahrefs":
      return Boolean(toolConfig.ahrefs?.enabled && toolConfig.ahrefs.connectionId);
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

function memoryToolEnabled(
  tool: WorkspaceOrchestratorToolName,
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  switch (tool) {
    case "recall_memory":
      return hasWorkspaceAutomationKnowledgeTool(toolConfig);
    case "save_memory":
      return hasWorkspaceAutomationKnowledgeUpdatesAllowed(toolConfig);
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
      ...enabled.filter((tool) => tool === "create_native_tms_job"),
      ...enabled.filter((tool) => tool === "assign_translate_with_agent"),
      ...enabled.filter((tool) => tool === "use_semrush"),
      ...enabled.filter((tool) => tool === "use_ahrefs"),
    ];
  }

  return [
    ...enabled.filter((tool) => tool === "use_github_repository"),
    ...enabled.filter((tool) => tool === "run_github_workflows"),
    ...enabled.filter((tool) => tool === "run_contentful_translation"),
    ...enabled.filter((tool) => tool === "create_native_tms_job"),
    ...enabled.filter((tool) => tool === "assign_translate_with_agent"),
    ...enabled.filter((tool) => tool === "use_semrush"),
    ...enabled.filter((tool) => tool === "use_ahrefs"),
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
  const memoryTools = MEMORY_TOOLS.filter((tool) => memoryToolEnabled(tool, automation.toolConfig));
  const saveMemoryTools = SAVE_MEMORY_TOOLS.filter((tool) =>
    memoryToolEnabled(tool, automation.toolConfig),
  );

  // recall_memory runs first and save_memory runs last before notifications: every planned tool
  // executes strictly in this order (agent.ts's prepareStep forces each one in turn), so recalled
  // guidance lands before the workflow tools it's meant to inform, and a memory write reflects
  // what those tools actually did before the run's notification summarizes the outcome.
  return {
    tools: [...memoryTools, ...workflowTools, ...saveMemoryTools, ...notificationTools],
  };
}

/**
 * Whether the plan includes at least one tool beyond the memory tools — callers use this instead
 * of a raw plan.tools.length check to decide whether a run is meaningful enough to dispatch. A
 * plan of only recall_memory and/or save_memory means the run would, at best, read Memory and
 * *maybe* write to it if the model decides to — never a guaranteed workflow or notification
 * effect, and consistent with workspaceAutomationFormCanActivate excluding Memory from the tools
 * that make an automation activatable in the UI.
 */
export function planHasActionableTool(plan: WorkspaceOrchestratorPlan): boolean {
  return plan.tools.some((tool) => !MEMORY_ONLY_TOOLS.includes(tool));
}
