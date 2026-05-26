import { start } from "workflow/api";

import { emailTranslationWorkflow } from "./email-translation";
import { fileTranslationJobWorkflow } from "./file-translation-job";
import { githubFixWorkflow } from "./github-fix";
import { providerAgentCommentWorkflow } from "./provider-agent-comment";
import { providerAgentQaWorkflow } from "./provider-agent-qa";
import { providerAgentTranslationWorkflow } from "./provider-agent-translation";
import { providerAgentWritebackWorkflow } from "./provider-agent-writeback";
import { repositoryAgentWorkflow } from "./repository-agent";
import { translationJobWorkflow } from "./translation-job";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  RepositoryAgentTaskQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";

export function createTranslationJobEventQueue(): JobQueue<TranslationJobEventData> {
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

export function createRepositoryAgentTaskQueue(): RepositoryAgentTaskQueue {
  return {
    async enqueue(task) {
      const run = await start(repositoryAgentWorkflow, [task]);
      return { ids: [run.runId] };
    },
  };
}

export function createProviderAgentTranslationQueue(): ProviderAgentTranslationQueue {
  return {
    async enqueue(event) {
      const run = await start(providerAgentTranslationWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}

export function createProviderAgentQaQueue(): ProviderAgentQaQueue {
  return {
    async enqueue(event) {
      const run = await start(providerAgentQaWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}

export function createProviderAgentCommentQueue(): ProviderAgentCommentQueue {
  return {
    async enqueue(event) {
      const run = await start(providerAgentCommentWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}

export function createProviderAgentWritebackQueue(): ProviderAgentWritebackQueue {
  return {
    async enqueue(event) {
      const run = await start(providerAgentWritebackWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}
