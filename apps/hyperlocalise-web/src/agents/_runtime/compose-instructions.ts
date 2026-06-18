import { loadAgentInstructions, loadAgentSkill, loadSharedSkill } from "./loader";

export type ComposeInstructionsInput = {
  agentId?: string;
  automationId?: string;
  base?: string;
  skills?: string[];
  sharedSkills?: string[];
  dynamicSections?: string[];
  userOverride?: string | null;
};

function resolveBaseInstructions(input: ComposeInstructionsInput): string {
  if (input.base?.trim()) {
    return input.base.trim();
  }

  if (input.automationId) {
    return loadAgentInstructions({ automationId: input.automationId });
  }

  if (input.agentId) {
    return loadAgentInstructions({ agentId: input.agentId });
  }

  return "";
}

export function composeInstructions(input: ComposeInstructionsInput): string {
  const sections: string[] = [];

  const base = resolveBaseInstructions(input);
  if (base) {
    sections.push(base);
  }

  for (const skillId of input.sharedSkills ?? []) {
    const skill = loadSharedSkill(skillId);
    if (skill.trim()) {
      sections.push(skill.trim());
    }
  }

  for (const skillId of input.skills ?? []) {
    const skill = input.automationId
      ? loadAgentSkill({ automationId: input.automationId, skillId })
      : input.agentId
        ? loadAgentSkill({ agentId: input.agentId, skillId })
        : "";
    if (skill.trim()) {
      sections.push(skill.trim());
    }
  }

  for (const section of input.dynamicSections ?? []) {
    if (section.trim()) {
      sections.push(section.trim());
    }
  }

  if (input.userOverride?.trim()) {
    sections.push("## Customer instructions", input.userOverride.trim());
  }

  return sections.join("\n\n");
}
