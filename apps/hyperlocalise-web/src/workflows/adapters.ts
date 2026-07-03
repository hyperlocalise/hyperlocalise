import { start } from "workflow/api";

import { createLogger } from "@/lib/log";
import { emailTranslationWorkflow } from "./email-translation";
import { workspaceAutomationExecutionWorkflow } from "./workspace-automation-execution";
import { githubRepositoryAutomationWorkflow } from "./github-repository-automation";
import { providerAgentCommentWorkflow } from "./provider-agent-comment";
import { providerAgentQaWorkflow } from "./provider-agent-qa";
import { providerAgentTranslationWorkflow } from "./provider-agent-translation";
import { providerAgentWritebackWorkflow } from "./provider-agent-writeback";
import { repositoryAgentWorkflow } from "./repository-agent";
import type {
  EmailAgentTaskQueue,
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  SourceFileIngestQueue,
  TranslationFileImportQueue,
  WorkspaceAutomationExecutionQueue,
  RepositoryAgentTaskQueue,
} from "@/lib/workflow/types";

const providerAgentTranslationQueueLogger = createLogger("provider-agent-translation-queue");

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
      providerAgentTranslationQueueLogger.info(
        {
          agentRunId: event.agentRunId,
          organizationId: event.organizationId,
          workflowRunId: run.runId,
        },
        "provider agent translation workflow enqueued",
      );
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

export function createWorkspaceAutomationExecutionQueue(): WorkspaceAutomationExecutionQueue {
  return {
    async enqueue(event) {
      const run = await start(workspaceAutomationExecutionWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}

export function createSourceFileIngestQueue(): SourceFileIngestQueue {
  return {
    async enqueue(event) {
      const { sourceFileIngestWorkflow } = await import("@/workflows/source-file-ingest");
      const run = await start(sourceFileIngestWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}

export function createTranslationFileImportQueue(): TranslationFileImportQueue {
  return {
    async enqueue(event) {
      const { translationFileImportWorkflow } = await import("@/workflows/translation-file-import");
      const run = await start(translationFileImportWorkflow, [event]);
      return { ids: [run.runId] };
    },
  };
}
