import type { ToolSet } from "ai";

import { getAgentManifest, type AgentSkillDocument } from "@/agents/_runtime/loader";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import type { HyperlocaliseConversationIntent } from "@/lib/agent-runtime/loops/conversation-mode";
import { createCheckCrowdinProgressTool } from "@/agents/_runtime/shared-tools/check_crowdin_progress";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import {
  createGetProjectContextTool,
  createListProjectsTool,
  createUpdateInteractionProjectTool,
} from "@/lib/tools/project-tools";

const CONVERSATION_AGENT_ID = "hyperlocalise";

const BASE_CONVERSATION_SKILL_IDS = ["orchestration", "repository-handoff"] as const;

export type ConversationSkillMetadata = {
  id: string;
  always: boolean;
  activationIntents: HyperlocaliseConversationIntent[];
  excludeIntents: HyperlocaliseConversationIntent[];
  requiresFileAttachments?: boolean;
  requiresNoFileAttachments: boolean;
  tools: string[];
  sharedSkills: string[];
  delegate: boolean;
};

export type ConversationSkillPlan = {
  instructionSkillIds: string[];
  sharedSkillIds: string[];
  toolNames: string[];
  skipDelegation: boolean;
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
    always:
      frontmatter.always === "true" ||
      (BASE_CONVERSATION_SKILL_IDS as readonly string[]).includes(skill.id),
    activationIntents: parseCommaSeparated(
      frontmatter.activationIntents,
    ) as HyperlocaliseConversationIntent[],
    excludeIntents: parseCommaSeparated(
      frontmatter.excludeIntents,
    ) as HyperlocaliseConversationIntent[],
    requiresFileAttachments: parseBooleanFlag(frontmatter.requiresFileAttachments),
    requiresNoFileAttachments: frontmatter.requiresNoFileAttachments === "true",
    tools: parseCommaSeparated(frontmatter.tools),
    sharedSkills: parseCommaSeparated(frontmatter.sharedSkills),
    delegate: frontmatter.delegate !== "false",
  };
}

export function listConversationSkills(): ConversationSkillMetadata[] {
  const manifest = getAgentManifest({ agentId: CONVERSATION_AGENT_ID });
  return Object.values(manifest.skills).map(parseConversationSkillMetadata);
}

export function isConversationSkillActivated(
  skill: ConversationSkillMetadata,
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "suggestedIntents" | "hasFileAttachments">,
): boolean {
  if (skill.always) {
    return false;
  }

  if (skill.activationIntents.length === 0) {
    return false;
  }

  const matchesIntent = skill.activationIntents.some((intent) =>
    runtime.suggestedIntents.includes(intent),
  );
  if (!matchesIntent) {
    return false;
  }

  if (skill.excludeIntents.some((intent) => runtime.suggestedIntents.includes(intent))) {
    return false;
  }

  if (skill.requiresFileAttachments === true && !runtime.hasFileAttachments) {
    return false;
  }

  if (skill.requiresFileAttachments === false && runtime.hasFileAttachments) {
    return false;
  }

  if (skill.requiresNoFileAttachments && runtime.hasFileAttachments) {
    return false;
  }

  return true;
}

export function buildConversationSkillPlan(
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "suggestedIntents" | "hasFileAttachments">,
): ConversationSkillPlan {
  const skills = listConversationSkills();
  const activatedSkills = skills.filter((skill) => isConversationSkillActivated(skill, runtime));

  const instructionSkillIds = [
    ...BASE_CONVERSATION_SKILL_IDS,
    ...activatedSkills.map((skill) => skill.id),
  ];

  const sharedSkillIds = [...new Set(activatedSkills.flatMap((skill) => skill.sharedSkills))];

  const toolNames = [...new Set(activatedSkills.flatMap((skill) => skill.tools))];

  return {
    instructionSkillIds,
    sharedSkillIds,
    toolNames,
    skipDelegation: activatedSkills.some((skill) => !skill.delegate),
  };
}

export function buildConversationSkillTools(
  toolContext: ToolContext,
  toolNames: readonly string[],
): ToolSet {
  const tools: ToolSet = {};

  for (const toolName of toolNames) {
    const factory = conversationSkillToolFactories[toolName];
    if (!factory) {
      throw new Error(`Unknown conversation skill tool: ${toolName}`);
    }

    tools[toolName] = factory(toolContext);
  }

  return tools;
}
