import { composeInstructions } from "@/agents/_runtime/compose-instructions";

import type { ConversationSkillPlan } from "./conversation-skill-registry";

import type { HyperlocaliseAgentSurface } from "@/agents/hyperlocalise/agent/agent";
import { buildHyperlocaliseDynamicSections } from "@/agents/hyperlocalise/agent/agent";

export function buildConversationSkillInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  skillPlan: ConversationSkillPlan;
  additionalInstructions?: string;
}) {
  return composeInstructions({
    agentId: "hyperlocalise",
    skills: input.skillPlan.instructionSkillIds,
    sharedSkills: input.skillPlan.sharedSkillIds,
    dynamicSections: buildHyperlocaliseDynamicSections(input),
  });
}
