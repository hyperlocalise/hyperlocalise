export async function executeProviderAgentCommentStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  const { executeProviderAgentComment } =
    await import("@/lib/providers/agent-runs/provider-agent-comment");
  return executeProviderAgentComment(input);
}

export async function failProviderAgentCommentStep(input: {
  agentRunId: string;
  organizationId: string;
  code: string;
  message: string;
}) {
  "use step";
  const { failAgentRun } = await import("@/lib/providers/agent-runs/agent-runs");

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
