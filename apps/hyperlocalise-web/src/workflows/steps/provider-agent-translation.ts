export async function executeProviderAgentTranslationStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  const { executeProviderAgentTranslation } =
    await import("@/lib/providers/agent-runs/provider-agent-translate");
  return executeProviderAgentTranslation(input);
}

export async function failProviderAgentTranslationStep(input: {
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
