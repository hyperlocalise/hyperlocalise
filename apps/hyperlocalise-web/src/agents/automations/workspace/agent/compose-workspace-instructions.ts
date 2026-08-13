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

import type { WorkspaceOrchestratorPlan } from "./plan";
import type { WorkspaceAutomationTriggerConfig } from "@/lib/agents/workspace-automations";

export function composeWorkspaceAutomationInstructions(input: {
  templateSkillId?: string | null;
  userOverride?: string | null;
  triggerMode: WorkspaceAutomationTriggerConfig["mode"];
  plan: WorkspaceOrchestratorPlan;
}) {
  // Org Memory access is a tool call, not text pasted into these instructions — see
  // recall_memory.ts / save_memory.ts. These two lines are only a nudge so the agent knows the
  // tools exist and when to reach for them; the actual guidance never lands in the prompt here.
  const hasRecallMemory = input.plan.tools.includes("recall_memory");
  const hasSaveMemory = input.plan.tools.includes("save_memory");

  const enabledToolsSection = [
    "## Enabled tools",
    `Trigger mode: ${input.triggerMode}.`,
    `Execution plan: ${input.plan.tools.map((tool) => `\`${tool}\``).join(" → ") || "none"}.`,
    hasRecallMemory
      ? "You have a recall_memory tool for organization guidance. Call it when relevant to this automation's task."
      : null,
    hasSaveMemory
      ? "You have a save_memory tool. Use it only when this automation's own instructions say to remember something."
      : null,
    "Call each planned tool in order. Use customer instructions when invoking workflow tools.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const dynamicSections = [enabledToolsSection];

  const skills = input.templateSkillId ? [input.templateSkillId] : [];
  const sharedSkills = input.plan.tools.includes("notify_slack") ? ["slack-notifications"] : [];

  return composeInstructions({
    automationId: "workspace",
    sharedSkills,
    skills,
    dynamicSections,
    userOverride: input.userOverride,
  });
}
