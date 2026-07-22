/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { start } from "workflow/api";

import type { TranslationJobEventData, ReviewJobEventData, JobQueue } from "@/lib/workflow/types";

export function createTranslationJobEventQueue(): JobQueue<TranslationJobEventData> {
  return {
    async enqueue(event) {
      const { fileTranslationJobWorkflow } = await import("@/workflows/file-translation-job");
      const { translationJobWorkflow } = await import("@/workflows/translation-job");
      const workflow = event.type === "file" ? fileTranslationJobWorkflow : translationJobWorkflow;
      const run = await start(workflow, [event]);

      return {
        ids: [run.runId],
      };
    },
  };
}

export function createReviewJobEventQueue(): JobQueue<ReviewJobEventData> {
  return {
    async enqueue(event) {
      const { reviewJobWorkflow } = await import("@/workflows/review-job");
      const run = await start(reviewJobWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}
