import type {
  ContentfulAutomationExecutionError,
  ContentfulAutomationExecutionSuccess,
} from "@/lib/contentful/types";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import type { ContentfulAutomationExecutionEventData } from "@/lib/workflow/types";

const logger = createLogger("contentful-automation-step");

export type ContentfulAutomationStepResult =
  | { ok: true; value: ContentfulAutomationExecutionSuccess }
  | { ok: false; error: ContentfulAutomationExecutionError };

export async function executeContentfulAutomationStep(
  event: ContentfulAutomationExecutionEventData,
): Promise<ContentfulAutomationStepResult> {
  "use step";
  const stepContext = {
    contentfulTranslationRunId: event.contentfulTranslationRunId,
    workspaceAutomationRunId: event.workspaceAutomationRunId,
    organizationId: event.organizationId,
  };

  logger.info(stepContext, "contentful automation step started");

  const { runContentfulAgent } =
    await import("@/agents/automations/contentful/agent/run-contentful-agent");

  try {
    const result = await runContentfulAgent(event);

    if (isErr(result)) {
      const stepResult: ContentfulAutomationStepResult = {
        ok: false,
        error: result.error,
      };
      logger.warn(
        {
          ...stepContext,
          runId: result.error.runId,
          errorCode: result.error.code,
        },
        "contentful automation step completed with execution error",
      );
      return stepResult;
    }

    const stepResult: ContentfulAutomationStepResult = {
      ok: true,
      value: result.value,
    };
    logger.info(
      {
        ...stepContext,
        runId: result.value.runId,
      },
      "contentful automation step completed successfully",
    );
    return stepResult;
  } catch (error) {
    logger.error(
      {
        ...stepContext,
        err: serializeErrorForLog(error),
      },
      "contentful automation step threw before returning",
    );
    throw error;
  }
}
