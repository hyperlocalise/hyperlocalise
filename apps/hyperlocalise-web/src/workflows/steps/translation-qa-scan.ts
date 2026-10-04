/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { TranslationQaScanEventData } from "@/lib/workflow/types";

export async function scanTranslationQaPageStep(input: {
  runId: string;
  organizationId: string;
  projectId: string;
  afterKeyId: string | null;
  page: number;
}) {
  "use step";
  const { createLogger, serializeErrorForLog } = await import("@/lib/log");
  const logger = createLogger("translation-qa-scan-step");
  const stepContext = {
    runId: input.runId,
    projectId: input.projectId,
    page: input.page,
    hasAfterKeyId: Boolean(input.afterKeyId),
  };
  const startedAt = Date.now();
  logger.info(stepContext, "translation qa scan page step started");

  const { scanTranslationQaPage } = await import("@/lib/qa/run-project-qa-scan");
  try {
    const result = await scanTranslationQaPage(input);
    logger.info(
      {
        ...stepContext,
        done: result.done,
        durationMs: Date.now() - startedAt,
      },
      "translation qa scan page step completed",
    );
    return result;
  } catch (error) {
    logger.error(
      {
        ...stepContext,
        durationMs: Date.now() - startedAt,
        err: serializeErrorForLog(error),
      },
      "translation qa scan page step threw",
    );
    throw error;
  }
}

export async function completeTranslationQaScanStep(input: TranslationQaScanEventData) {
  "use step";
  const { createLogger, serializeErrorForLog } = await import("@/lib/log");
  const logger = createLogger("translation-qa-scan-step");
  const stepContext = {
    runId: input.runId,
    projectId: input.projectId,
  };
  const startedAt = Date.now();
  logger.info(stepContext, "translation qa scan complete step started");

  const { completeTranslationQaScan } = await import("@/lib/qa/run-project-qa-scan");
  try {
    const result = await completeTranslationQaScan(input);
    logger.info(
      {
        ...stepContext,
        alreadyCompleted: result.alreadyCompleted,
        durationMs: Date.now() - startedAt,
      },
      "translation qa scan complete step completed",
    );
    return result;
  } catch (error) {
    logger.error(
      {
        ...stepContext,
        durationMs: Date.now() - startedAt,
        err: serializeErrorForLog(error),
      },
      "translation qa scan complete step threw",
    );
    throw error;
  }
}

export async function failTranslationQaScanStep(input: {
  runId: string;
  projectId: string;
  errorCode: string;
  errorMessage: string;
  errorType: string;
}) {
  "use step";
  const { createLogger } = await import("@/lib/log");
  const { failTranslationQaRun } = await import("@/lib/qa/run-project-qa-scan");
  await failTranslationQaRun(input);
  createLogger("translation-qa-scan-step").error(
    {
      runId: input.runId,
      projectId: input.projectId,
      failureCode: input.errorCode,
      errorType: input.errorType,
      errorMessage: input.errorMessage,
    },
    "translation qa scan failed",
  );
}
