import type { Bash } from "just-bash";
import type { ToolSet } from "ai";

import { getAgentManifest, type AgentSkillDocument } from "@/agents/_runtime/loader";
import { createCheckCrowdinProgressTool } from "@/agents/_runtime/shared-tools/check_crowdin_progress";
import { createTranslateStringTool } from "@/agents/_runtime/shared-tools/translate_string";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import { repositoryWorkspaceToolNames } from "@/lib/agent-contracts/repository-workspace-tools";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { createSandboxRepoBash } from "@/lib/agent-runtime/workspaces/sandbox-repo-bash";
import { buildTools, buildWorkspaceTools } from "@/lib/agent-runtime/tools/registry";
import {
  createGetProjectContextTool,
  createListProjectsTool,
  createUpdateInteractionProjectTool,
} from "@/lib/tools/project-tools";

const CONVERSATION_AGENT_ID = "hyperlocalise";

const REPO_TOOL_NAMES = new Set<string>(repositoryWorkspaceToolNames);
const PROJECT_GATED_TOOL_NAMES = new Set(["translate_string"]);

export type ConversationSkillMetadata = {
  id: string;
  always: boolean;
  requiresSandbox: boolean;
  requiresProjectId: boolean;
  requiresFileAttachments?: boolean;
  requiresProjectOrAttachments: boolean;
  tools: string[];
  sharedSkills: string[];
};

export type ConversationSkillPlan = {
  instructionSkillIds: string[];
  sharedSkillIds: string[];
  toolNames: string[];
};

export type ConversationSkillActivationContext = {
  hasFileAttachments: boolean;
  hasProjectId: boolean;
  hasSandbox: boolean;
};

type ConversationSkillToolFactory = (toolContext: ToolContext) => ToolSet[string];

const conversationSkillToolFactories: Record<string, ConversationSkillToolFactory> = {
  list_projects: (toolContext) => createListProjectsTool(toolContext),
  get_project_context: (toolContext) => createGetProjectContextTool(toolContext),
  update_interaction_project: (toolContext) => createUpdateInteractionProjectTool(toolContext),
  check_crowdin_progress: (toolContext) => createCheckCrowdinProgressTool(toolContext),
};

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function parseConversationSkillMetadata(
  skill: AgentSkillDocument,
): ConversationSkillMetadata {
  const { frontmatter } = skill;

  return {
    id: skill.id,
    always: frontmatter.always === "true",
    requiresSandbox: frontmatter.requiresSandbox === "true",
    requiresProjectId: frontmatter.requiresProjectId === "true",
    requiresFileAttachments: parseBooleanFlag(frontmatter.requiresFileAttachments),
    requiresProjectOrAttachments: frontmatter.requiresProjectOrAttachments === "true",
    tools: parseCommaSeparated(frontmatter.tools),
    sharedSkills: parseCommaSeparated(frontmatter.sharedSkills),
  };
}

export function listConversationSkills(): ConversationSkillMetadata[] {
  const manifest = getAgentManifest({ agentId: CONVERSATION_AGENT_ID });
  return Object.values(manifest.skills).map(parseConversationSkillMetadata);
}

export function toConversationSkillActivationContext(
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "hasFileAttachments" | "toolContext">,
): ConversationSkillActivationContext {
  return {
    hasFileAttachments: runtime.hasFileAttachments,
    hasProjectId: Boolean(runtime.toolContext.projectId),
    hasSandbox: Boolean(runtime.toolContext.sandboxId),
  };
}

export function isConversationSkillActivated(
  skill: ConversationSkillMetadata,
  context: ConversationSkillActivationContext,
): boolean {
  if (skill.always) {
    return true;
  }

  if (skill.requiresSandbox && !context.hasSandbox) {
    return false;
  }

  if (skill.requiresProjectId && !context.hasProjectId) {
    return false;
  }

  if (skill.requiresFileAttachments === true && !context.hasFileAttachments) {
    return false;
  }

  if (skill.requiresFileAttachments === false && context.hasFileAttachments) {
    return false;
  }

  if (skill.requiresProjectOrAttachments && !context.hasProjectId && !context.hasFileAttachments) {
    return false;
  }

  const hasActivationRule =
    skill.requiresSandbox ||
    skill.requiresProjectId ||
    skill.requiresFileAttachments !== undefined ||
    skill.requiresProjectOrAttachments;

  return hasActivationRule;
}

export function buildConversationSkillPlan(
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "hasFileAttachments" | "toolContext">,
): ConversationSkillPlan {
  const context = toConversationSkillActivationContext(runtime);
  const activeSkills = listConversationSkills().filter((skill) =>
    isConversationSkillActivated(skill, context),
  );

  return {
    instructionSkillIds: activeSkills.map((skill) => skill.id),
    sharedSkillIds: [...new Set(activeSkills.flatMap((skill) => skill.sharedSkills))],
    toolNames: [...new Set(activeSkills.flatMap((skill) => skill.tools))],
  };
}

export function filterAvailableConversationToolNames(
  toolNames: readonly string[],
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "toolContext">,
): string[] {
  return toolNames.filter((toolName) => {
    if (PROJECT_GATED_TOOL_NAMES.has(toolName) && !runtime.toolContext.projectId) {
      return false;
    }

    if (REPO_TOOL_NAMES.has(toolName) && !runtime.toolContext.sandboxId) {
      return false;
    }

    return true;
  });
}

export function buildConversationSkillTools(
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "toolContext">,
  toolNames: readonly string[],
): ToolSet {
  const ctx = runtime.toolContext;
  const availableToolNames = filterAvailableConversationToolNames(toolNames, runtime);
  const tools: ToolSet = {};

  const needsRepoTools = availableToolNames.some((toolName) => REPO_TOOL_NAMES.has(toolName));
  const repoTools =
    needsRepoTools && ctx.sandboxId
      ? buildWorkspaceTools(ctx, { bash: createSandboxRepoBash(ctx.sandboxId) as Bash })
      : null;

  const builtTools = buildTools(ctx);

  for (const toolName of availableToolNames) {
    if (REPO_TOOL_NAMES.has(toolName)) {
      const repoTool = repoTools?.[toolName];
      if (repoTool) {
        tools[toolName] = repoTool;
      }
      continue;
    }

    if (toolName === "createTranslationJob" && builtTools.createTranslationJob) {
      tools[toolName] = builtTools.createTranslationJob;
      continue;
    }

    if (toolName === "translate_string" && ctx.projectId) {
      tools[toolName] = createTranslateStringTool(ctx);
      continue;
    }

    const factory = conversationSkillToolFactories[toolName];
    if (factory) {
      tools[toolName] = factory(ctx);
    }
  }

  return tools;
}
