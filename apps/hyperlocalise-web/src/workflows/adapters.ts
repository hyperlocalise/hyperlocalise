import { start } from "workflow/api";

import { githubFixWorkflow } from "./github-fix";
import { translationJobWorkflow } from "./translation-job";
import type { GitHubFixQueue, TranslationJobQueue } from "@/lib/workflow/types";

export function createTranslationJobQueue(): TranslationJobQueue {
  return {
    async enqueue(event) {
      const run = await start(translationJobWorkflow, [event]);

      return {
        ids: [run.runId],
      };
    },
  };
}

export function createGitHubFixQueue(): GitHubFixQueue {
  return {
    async enqueue(event) {
      const run = await start(githubFixWorkflow, [event]);

      return {
        ids: [run.runId],
      };
    },
  };
}
