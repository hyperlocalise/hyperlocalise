import { start } from "workflow/api";

import { emailTranslationWorkflow } from "./email-translation";
import { contentfulAutomationExecutionWorkflow } from "./contentful-automation-execution";
import { githubRepositoryAutomationWorkflow } from "./github-repository-automation";
import { providerAgentCommentWorkflow } from "./provider-agent-comment";
import { providerAgentQaWorkflow } from "./provider-agent-qa";
import { providerAgentTranslationWorkflow } from "./provider-agent-translation";
import { providerAgentWritebackWorkflow } from "./provider-agent-writeback";
import { providerSyncWorkflow } from "./provider-sync";
import { repositoryAgentWorkflow } from "./repository-agent";
import type {
  EmailAgentTaskQueue,
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderSyncQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  ContentfulAutomationExecutionQueue,
  RepositoryAgentTaskQueue,
} from "@/lib/workflow/types";

export { createTranslationJobEventQueue, createReviewJobEventQueue } from "@/lib/workflow/queues";

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

export function createGithubRepositoryAutomationQueue(): JobQueue<{
  jobId: string;
}> {
  return {
    async enqueue(event) {
      const run = await start(githubRepositoryAutomationWorkflow, [event]);
      return { ids: [run.runId] };
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

export function createContentfulAutomationExecutionQueue(): ContentfulAutomationExecutionQueue {
  return {
    async enqueue(event) {
      const run = await start(contentfulAutomationExecutionWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}

export function createProviderSyncQueue(): ProviderSyncQueue {
  return {
    async enqueue(event) {
      const run = await start(providerSyncWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}
