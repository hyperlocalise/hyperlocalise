import { start } from "workflow/api";

import { emailTranslationWorkflow } from "./email-translation";
import { githubFixWorkflow } from "./github-fix";
import { githubRepositoryAutomationWorkflow } from "./github-repository-automation";
import { i18nSetupWorkflow } from "./i18n-setup";
import { providerAgentCommentWorkflow } from "./provider-agent-comment";
import { providerAgentQaWorkflow } from "./provider-agent-qa";
import { providerAgentTranslationWorkflow } from "./provider-agent-translation";
import { providerAgentWritebackWorkflow } from "./provider-agent-writeback";
import { providerWebhookReconciliationWorkflow } from "./provider-webhook-reconciliation";
import { repositoryAgentWorkflow } from "./repository-agent";
import type {
  EmailAgentTaskQueue,
  GitHubFixQueue,
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  ProviderWebhookReconciliationQueue,
  I18nSetupQueue,
  RepositoryAgentTaskQueue,
} from "@/lib/workflow/types";

export { createTranslationJobEventQueue } from "@/lib/workflow/queues";

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

export function createI18nSetupQueue(): I18nSetupQueue {
  return {
    async enqueue(event) {
      const run = await start(i18nSetupWorkflow, [event]);
      return { ids: [run.runId] };
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

export function createProviderWebhookReconciliationQueue(): ProviderWebhookReconciliationQueue {
  return {
    async enqueue(event) {
      const run = await start(providerWebhookReconciliationWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}
