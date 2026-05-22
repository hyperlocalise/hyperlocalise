import { executeProviderAgentTranslation } from "@/lib/providers/provider-agent-translate";

export async function executeProviderAgentTranslationStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return executeProviderAgentTranslation(input);
}
