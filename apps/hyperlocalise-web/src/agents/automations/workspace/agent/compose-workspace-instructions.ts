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
    input.knowledgeEnabled
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
