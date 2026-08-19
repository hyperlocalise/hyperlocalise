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
        skill.frontmatter.description?.trim() ||
        skill.body
          .split("\n")
          .find((line) => line.trim().length > 0)
          ?.trim() ||
        template.description,
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

export function resolveWorkspaceTemplateSharedSkills(templateSkillId: string | null): string[] {
  if (!templateSkillId) {
    return [];
  }

  const raw = getAgentManifest({ automationId: "workspace" }).skills[templateSkillId]?.frontmatter
    .sharedSkills;
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveWorkspaceOrchestratorSharedSkills(input: {
  templateSkillId?: string | null;
  planTools: readonly string[];
}): string[] {
  const fromTemplate = resolveWorkspaceTemplateSharedSkills(input.templateSkillId ?? null);
  const skills: string[] = [
    ...(input.planTools.includes("notify_slack") ? ["slack-notifications"] : []),
    ...(input.planTools.includes("notify_github_comment") ? ["github-comment-notifications"] : []),
    ...fromTemplate,
  ];

  if (input.planTools.includes("use_crowdin") && fromTemplate.includes("translation-review")) {
    skills.push("crowdin-concordance-review");
  }

  return [...new Set(skills)];
}

export function composeGithubRepoInstructions(input: {
  userOverride?: string | null;
  dynamicSections?: string[];
  templateSkillId?: string | null;
}) {
  const sharedSkills = [
    "recent-source-changes",
    ...resolveWorkspaceTemplateSharedSkills(input.templateSkillId ?? null),
  ];

  return composeInstructions({
    automationId: "github-repository",
    sharedSkills: [...new Set(sharedSkills)],
    skills: ["github-repo-agent"],
    dynamicSections: input.dynamicSections,
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
