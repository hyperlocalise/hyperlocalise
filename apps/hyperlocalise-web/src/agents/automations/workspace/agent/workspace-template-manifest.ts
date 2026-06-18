import { composeInstructions } from "@/agents/_runtime/compose-instructions";
import { getAgentManifest, type AgentSkillDocument } from "@/agents/_runtime/loader";
import type {
  WorkspaceAutomationTemplate,
  WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";

export function mergeWorkspaceTemplateSkills(
  templates: WorkspaceAutomationTemplate[],
): WorkspaceAutomationTemplate[] {
  const manifest = getAgentManifest({ automationId: "workspace" });

  return templates.map((template) => {
    const skill = manifest.skills[template.id];
    if (!skill) {
      return template;
    }

    const category = getTemplateCategoryFromSkill(template.id) ?? template.category;

    return {
      ...template,
      category,
      name: skill.frontmatter.name || template.name,
      description:
        skill.body
          .split("\n")
          .find((line) => line.trim().length > 0)
          ?.trim() ?? template.description,
      instructions: skill.body.trim() || template.instructions,
      activatable: skill.frontmatter.activatable !== "false" ? template.activatable : false,
    };
  });
}

export function listWorkspaceTemplateSkills(): AgentSkillDocument[] {
  return Object.values(getAgentManifest({ automationId: "workspace" }).skills);
}

export function composeContentfulAutomationInstructions(input: {
  templateSkillId?: string | null;
  userOverride?: string | null;
}) {
  return composeInstructions({
    automationId: "contentful",
    sharedSkills: ["string-translation"],
    skills: [input.templateSkillId ?? "translate-contentful-article"],
    userOverride: input.userOverride,
  });
}

export function getTemplateExecutorAgent(skillId: string): string | null {
  const skill = getAgentManifest({ automationId: "workspace" }).skills[skillId];
  return skill?.frontmatter.executorAgent ?? null;
}

export function getTemplateCategoryFromSkill(
  skillId: string,
): WorkspaceAutomationTemplateCategory | null {
  const category = getAgentManifest({ automationId: "workspace" }).skills[skillId]?.frontmatter
    .category;
  if (!category) {
    return null;
  }

  return category as WorkspaceAutomationTemplateCategory;
}
