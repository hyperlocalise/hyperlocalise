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
import { getAgentManifest, loadSharedSkill } from "@/agents/_runtime/loader";
import {
  resolveWorkspaceAutomationSkills,
  type WorkspaceAutomationSkill,
  type WorkspaceAutomationSkillTool,
} from "@/lib/agents/workspace-automation-skills";

function skillsForTool(
  skillIds: readonly string[],
  tool?: WorkspaceAutomationSkillTool,
): WorkspaceAutomationSkill[] {
  const skills = resolveWorkspaceAutomationSkills(skillIds);
  return tool ? skills.filter((skill) => skill.tools.includes(tool)) : skills;
}

/** Procedures of the attached skills, limited to those that declare `tool` when given. */
export function loadWorkspaceSkillProcedures(
  skillIds: readonly string[],
  tool?: WorkspaceAutomationSkillTool,
): string[] {
  const manifest = getAgentManifest({ automationId: "workspace" });
  return skillsForTool(skillIds, tool)
    .map((skill) => manifest.skills[skill.id]?.body.trim() ?? "")
    .filter((body) => body.length > 0);
}

export function resolveWorkspaceSkillSharedSkills(
  skillIds: readonly string[],
  tool?: WorkspaceAutomationSkillTool,
): string[] {
  return [...new Set(skillsForTool(skillIds, tool).flatMap((skill) => [...skill.sharedSkills]))];
}

/**
 * Task text for a tool that runs its own agent: the shared procedures named by the skills that
 * declare the tool, those skills' own procedures, then the customer's instructions. The shared
 * procedures are included because the skill text refers to them and the tool's agent sees
 * nothing else. Null when there is nothing to say.
 */
export function composeSkillToolInstructions(input: {
  skillIds: readonly string[];
  tool: WorkspaceAutomationSkillTool;
  customerInstructions: string;
}): string | null {
  const sections = [
    ...resolveWorkspaceSkillSharedSkills(input.skillIds, input.tool).map(loadSharedSkill),
    ...loadWorkspaceSkillProcedures(input.skillIds, input.tool),
    input.customerInstructions.trim(),
  ].filter((section) => section.length > 0);

  return sections.length > 0 ? sections.join("\n\n") : null;
}
