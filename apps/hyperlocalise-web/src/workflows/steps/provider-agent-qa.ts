import { failAgentRun } from "@/lib/providers/agent-runs";
import { executeProviderAgentQa } from "@/lib/providers/provider-agent-qa";

export async function executeProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return executeProviderAgentQa(input);
}

export async function failProviderAgentQaStep(input: {
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
