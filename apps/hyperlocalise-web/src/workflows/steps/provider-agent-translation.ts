import { createLogger, serializeErrorForLog } from "@/lib/log";

const logger = createLogger("provider-agent-translation-step");

export async function executeProviderAgentTranslationStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";

  const stepContext = {
    agentRunId: input.agentRunId,
    organizationId: input.organizationId,
  };

  logger.info(stepContext, "provider agent translation step started");

  const { executeProviderAgentTranslation } =
    await import("@/lib/providers/agent-runs/provider-agent-translate");

  try {
    const result = await executeProviderAgentTranslation(input);

    if (result.ok) {
      logger.info(
        {
          ...stepContext,
          proposedCount: result.proposedCount,
          unitsProcessed: result.unitsProcessed,
          alreadyCompleted: result.alreadyCompleted ?? false,
          ...(result.proposedCount === 0 && result.unitsProcessed === 0 && !result.alreadyCompleted
            ? { emptyTranslationResult: true }
            : {}),
        },
        "provider agent translation step completed successfully",
      );
      return result;
    }

    logger.warn(
      {
        ...stepContext,
        code: result.code,
      },
      "provider agent translation step completed with execution error",
    );
    return result;
  } catch (error) {
    logger.error(
      {
        ...stepContext,
        err: serializeErrorForLog(error),
      },
      "provider agent translation step threw before returning",
    );
    throw error;
  }
}

export async function failProviderAgentTranslationStep(input: {
  agentRunId: string;
  organizationId: string;
  code: string;
  message: string;
}) {
  "use step";

  logger.warn(
    {
      agentRunId: input.agentRunId,
      organizationId: input.organizationId,
      code: input.code,
    },
    "provider agent translation step failed",
  );

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
