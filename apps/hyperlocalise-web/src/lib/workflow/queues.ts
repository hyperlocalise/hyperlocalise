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
