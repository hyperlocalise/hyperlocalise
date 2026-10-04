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
import { getWorkflowMetadata } from "workflow";

import type { TranslationQaScanEventData } from "@/lib/workflow/types";

import {
  completeTranslationQaScanStep,
  failTranslationQaScanStep,
  scanTranslationQaPageStep,
} from "./steps/translation-qa-scan";

const MAX_SCAN_PAGES = 50_000;

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "translation qa scan failed";
}

export async function translationQaScanWorkflow(event: TranslationQaScanEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  let failureCode = "qa_scan_processing_failed";

  try {
    let afterKeyId: string | null = null;
    for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
      const result = await scanTranslationQaPageStep({
        runId: event.runId,
        organizationId: event.organizationId,
        projectId: event.projectId,
        afterKeyId,
        page,
      });
      if (result.done) {
        break;
      }
      afterKeyId = result.afterKeyId;
    }

    failureCode = "qa_scan_finalization_failed";
    const completed = await completeTranslationQaScanStep(event);
    return { ...completed, workflowRunId };
  } catch (error) {
    await failTranslationQaScanStep({
      runId: event.runId,
      projectId: event.projectId,
      errorCode: failureCode,
      errorMessage: formatExecutionError(error),
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      ok: false as const,
      code: failureCode,
      workflowRunId,
    };
  }
}
