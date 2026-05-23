import { failAgentRun } from "@/lib/providers/agent-runs";
import { executeProviderAgentWriteback } from "@/lib/providers/provider-agent-writeback";

export async function executeProviderAgentWritebackStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return executeProviderAgentWriteback(input);
}

export async function failProviderAgentWritebackStep(input: {
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
