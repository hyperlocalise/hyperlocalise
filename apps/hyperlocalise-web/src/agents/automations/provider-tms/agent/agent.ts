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

export {
  executeProviderAgentQa,
  executeProviderAgentTranslation,
  executeProviderAgentWriteback,
} from "./tools";

export { runTmsAgentAutomationForSyncedJob } from "./schedules/reconciliation";
