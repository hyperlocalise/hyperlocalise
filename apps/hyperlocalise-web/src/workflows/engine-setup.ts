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

import type { EngineSetupEventData } from "@/lib/engine-setup/types";

import {
  analyzeEngineSetupStep,
  crawlEngineSetupStep,
  failEngineSetupStep,
  prepareEngineSetupStep,
  setEngineSetupProgressStep,
} from "./steps/engine-setup";

/**
 * Reads a website and stores glossary, rule and brand voice suggestions for
 * review. It never writes to the glossary or knowledge memory; the apply route
 * does that after a user accepts suggestions.
 */
export async function engineSetupWorkflow(event: EngineSetupEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const prepared = await prepareEngineSetupStep({ runId: event.runId });
    if (!prepared.ok) {
      return { ...prepared, workflowRunId };
    }

    const crawl = await crawlEngineSetupStep({
      origin: prepared.origin,
      sourceUrl: prepared.sourceUrl,
    });
    await setEngineSetupProgressStep({
      runId: prepared.runId,
      progressStage: "extracting",
      pagesRead: crawl.pages.length,
    });

    const analyzed = await analyzeEngineSetupStep({
      runId: prepared.runId,
      organizationId: prepared.organizationId,
      sourceLocale: prepared.sourceLocale,
      pages: crawl.pages,
      blockedReason: crawl.blockedReason,
    });
    return { ...analyzed, workflowRunId };
  } catch (error) {
    await failEngineSetupStep({
      runId: event.runId,
      errorCode: "engine_setup_failed",
      errorMessage: "Setup stopped unexpectedly. Try again in a few minutes.",
    });
    return {
      ok: false as const,
      code: "engine_setup_failed" as const,
      message: error instanceof Error ? error.message : "engine setup failed",
      workflowRunId,
    };
  }
}
