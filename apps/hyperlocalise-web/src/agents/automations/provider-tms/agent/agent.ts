import { composeInstructions } from "@/agents/_runtime/compose-instructions";

export function composeProviderTmsAgentInstructions(input?: {
  skills?: string[];
  userOverride?: string | null;
}) {
  return composeInstructions({
    automationId: "provider-tms",
    sharedSkills: ["string-translation"],
    skills: input?.skills ?? [],
    userOverride: input?.userOverride,
  });
}

export { executeProviderAgentQa } from "@/lib/providers/agent-runs/provider-agent-qa";
export { executeProviderAgentTranslation } from "@/lib/providers/agent-runs/provider-agent-translate";
export { executeProviderAgentWriteback } from "@/lib/providers/agent-runs/provider-agent-writeback";

export { runTmsAgentAutomationForSyncedJob } from "./schedules/reconciliation";
