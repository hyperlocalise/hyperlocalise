export async function executeProviderAgentWritebackStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  const { executeProviderAgentWriteback } =
    await import("@/lib/providers/provider-agent-writeback");
  return executeProviderAgentWriteback(input);
}

export async function failProviderAgentWritebackStep(input: {
  agentRunId: string;
  organizationId: string;
  code: string;
  message: string;
}) {
  "use step";
  const { failAgentRun } = await import("@/lib/providers/agent-runs");

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
