import { start } from "workflow/api";

import { emailTranslationWorkflow } from "./email-translation";
import { fileTranslationJobWorkflow } from "./file-translation-job";
import { githubFixWorkflow } from "./github-fix";
import { translationJobWorkflow } from "./translation-job";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  TranslationJobQueue,
} from "@/lib/workflow/types";

export function createTranslationJobQueue(): TranslationJobQueue {
  return {
    async enqueue(event) {
      const workflow = event.type === "file" ? fileTranslationJobWorkflow : translationJobWorkflow;
      const run = await start(workflow, [event]);

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

export function createEmailAgentTaskQueue(): EmailAgentTaskQueue {
  return {
    async enqueue(task) {
      const run = await start(emailTranslationWorkflow, [task]);

      return {
        ids: [run.runId],
      };
    },
  };
}
