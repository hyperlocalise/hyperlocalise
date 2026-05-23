import { failAgentRun } from "@/lib/providers/agent-runs";
import { executeProviderAgentTranslation } from "@/lib/providers/provider-agent-translate";

export async function executeProviderAgentTranslationStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return executeProviderAgentTranslation(input);
}

export async function failProviderAgentTranslationStep(input: {
  agentRunId: string;
  organizationId: string;
  code: string;
  message: string;
}) {
  "use step";

  await failAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
    outputSummary: { code: input.code },
    warnings: [input.message],
  });

  return {
    ok: false as const,
    agentRunId: input.agentRunId,
    code: input.code,
    message: input.message,
  };
}
