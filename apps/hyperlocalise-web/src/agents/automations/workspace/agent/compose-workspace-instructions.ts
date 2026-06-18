import { composeInstructions } from "@/agents/_runtime/compose-instructions";

import type { WorkspaceOrchestratorPlan } from "./plan";
import type { WorkspaceAutomationTriggerConfig } from "@/lib/agents/workspace-automations";

export function composeWorkspaceAutomationInstructions(input: {
  templateSkillId?: string | null;
  userOverride?: string | null;
  triggerMode: WorkspaceAutomationTriggerConfig["mode"];
  plan: WorkspaceOrchestratorPlan;
}) {
  const enabledToolsSection = [
    "## Enabled tools",
    `Trigger mode: ${input.triggerMode}.`,
    `Execution plan: ${input.plan.tools.map((tool) => `\`${tool}\``).join(" → ") || "none"}.`,
    "Call each planned tool in order. Use customer instructions when invoking workflow tools.",
  ].join("\n");

  const skills = input.templateSkillId ? [input.templateSkillId] : [];

  return composeInstructions({
    automationId: "workspace",
    skills,
    dynamicSections: [enabledToolsSection],
    userOverride: input.userOverride,
  });
}
