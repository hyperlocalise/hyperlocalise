import { start } from "workflow/api";

import { emailTranslationWorkflow } from "./email-translation";
import { githubFixWorkflow } from "./github-fix";
import { translationJobWorkflow } from "./translation-job";
import type {
  EmailTranslationQueue,
  GitHubFixQueue,
  TranslationJobQueue,
} from "@/lib/workflow/types";

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

export function createEmailTranslationQueue(): EmailTranslationQueue {
  return {
    async enqueue(event) {
      const run = await start(emailTranslationWorkflow, [event]);

      return {
        ids: [run.runId],
      };
    },
  };
}
