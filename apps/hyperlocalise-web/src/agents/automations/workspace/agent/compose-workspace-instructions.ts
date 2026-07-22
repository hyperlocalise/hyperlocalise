/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { composeInstructions } from "@/agents/_runtime/compose-instructions";

import type { WorkspaceOrchestratorPlan } from "./plan";
import type { WorkspaceAutomationTriggerConfig } from "@/lib/agents/workspace-automations";

export function composeWorkspaceAutomationInstructions(input: {
  templateSkillId?: string | null;
  userOverride?: string | null;
  triggerMode: WorkspaceAutomationTriggerConfig["mode"];
  plan: WorkspaceOrchestratorPlan;
  knowledgeMemory?: string | null;
  knowledgeEnabled?: boolean;
}) {
  const enabledToolsSection = [
    "## Enabled tools",
    `Trigger mode: ${input.triggerMode}.`,
    `Execution plan: ${input.plan.tools.map((tool) => `\`${tool}\``).join(" → ") || "none"}.`,
    input.knowledgeEnabled && input.knowledgeMemory?.trim()
      ? "Workspace knowledge memories are enabled and applied as context below."
      : null,
    "Call each planned tool in order. Use customer instructions when invoking workflow tools.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const dynamicSections = [enabledToolsSection];
  if (input.knowledgeMemory?.trim()) {
    dynamicSections.push(`## Workspace knowledge\n${input.knowledgeMemory.trim()}`);
  }

  const skills = input.templateSkillId ? [input.templateSkillId] : [];

  return composeInstructions({
    automationId: "workspace",
    skills,
    dynamicSections,
    userOverride: input.userOverride,
  });
}
