import { failAgentRun } from "@/lib/providers/agent-runs";
import { executeProviderAgentComment } from "@/lib/providers/provider-agent-comment";

export async function executeProviderAgentCommentStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return executeProviderAgentComment(input);
}

export async function failProviderAgentCommentStep(input: {
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
