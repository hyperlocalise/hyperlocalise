import type {
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
} from "@/lib/workflow/types";

import {
  createOrReuseActivePushApprovedWriteBackAgentRun,
  createAgentRun,
  failAgentRun,
} from "../agent-runs/agent-runs";
import { getJobProviderActionDefinition } from "../job-provider-actions";
import type { ExternalTmsProviderKind } from "../organization-external-tms-provider-credentials";
import { resolveEffectiveTmsAgentAutomationSettings } from "./tms-agent-automation-settings-store";
import { shouldAutoRunQaOnSyncedJob } from "./tms-agent-automation-settings";

export type TmsAgentAutomationQueues = {
  providerAgentTranslationQueue?: ProviderAgentTranslationQueue;
  providerAgentQaQueue?: ProviderAgentQaQueue;
  providerAgentWritebackQueue?: ProviderAgentWritebackQueue;
};

export type SyncedExternalJobContext = {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string | null;
  hyperlocaliseJobId: string;
  externalJobId: string;
  externalTaskId: string | null;
  targetLocales: string[];
  isNewlySynced: boolean;
};

export async function runTmsAgentAutomationForSyncedJob(
  input: SyncedExternalJobContext & { queues?: TmsAgentAutomationQueues },
) {
  if (!input.isNewlySynced) {
    return { triggered: [] as string[] };
  }

  const settings = await resolveEffectiveTmsAgentAutomationSettings({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerCredentialId: input.providerCredentialId,
  });

  const triggered: string[] = [];

  const qaQueue = input.queues?.providerAgentQaQueue;
  if (shouldAutoRunQaOnSyncedJob(settings) && qaQueue) {
    const qaRun = await createAutomationAgentRun({
      ...input,
      action: "run_qa_checks",
    });

    if (qaRun) {
      const enqueued = await enqueueAgentRunOrFail({
        organizationId: input.organizationId,
        runId: qaRun.id,
        queueUnavailableMessage: "agent QA queue unavailable",
        enqueue: () =>
          qaQueue.enqueue({
            agentRunId: qaRun.id,
            organizationId: input.organizationId,
          }),
      });
      if (enqueued) {
        triggered.push("run_qa_checks");
      }
    }
  }

  const automationLocales = settings.autoDraftTranslations.locales.filter((locale) =>
    input.targetLocales.includes(locale),
  );

  const translationQueue = input.queues?.providerAgentTranslationQueue;
  if (settings.autoDraftTranslations.enabled && translationQueue && automationLocales.length > 0) {
    const translateRun = await createAutomationAgentRun({
      ...input,
      action: "translate_with_agent",
      automationLocales,
    });

    if (translateRun) {
      const enqueued = await enqueueAgentRunOrFail({
        organizationId: input.organizationId,
        runId: translateRun.id,
        queueUnavailableMessage: "agent translation queue unavailable",
        enqueue: () =>
          translationQueue.enqueue({
            agentRunId: translateRun.id,
            organizationId: input.organizationId,
          }),
      });
      if (enqueued) {
        triggered.push("translate_with_agent");
      }
    }
  }

  return { triggered };
}

async function createAutomationAgentRun(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  hyperlocaliseJobId: string;
  externalJobId: string;
  externalTaskId: string | null;
  action: "run_qa_checks" | "translate_with_agent";
  automationLocales?: string[];
}) {
  const actionDefinition = getJobProviderActionDefinition(input.action);
  if (!actionDefinition) {
    return null;
  }

  return createAgentRun({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    externalJobId: input.externalJobId,
    externalTaskId: input.externalTaskId,
    kind: actionDefinition.agentRunKind,
    inputSnapshot: {
      ...actionDefinition.inputSnapshot,
      action: input.action,
      hyperlocaliseJobId: input.hyperlocaliseJobId,
      projectId: input.projectId,
      triggeredBy: "tms_automation",
      ...(input.automationLocales && input.automationLocales.length > 0
        ? { automationLocales: input.automationLocales }
        : {}),
    },
    hyperlocaliseJobId: input.hyperlocaliseJobId,
  });
}

export async function maybeEnqueueAutoWriteBackAfterProposalReview(input: {
  organizationId: string;
  projectId: string;
  providerCredentialId: string | null;
  hyperlocaliseJobId: string;
  externalProviderKind: ExternalTmsProviderKind;
  externalJobId: string;
  externalTaskId: string | null;
  queues?: TmsAgentAutomationQueues;
}) {
  const settings = await resolveEffectiveTmsAgentAutomationSettings({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerCredentialId: input.providerCredentialId,
  });

  const writebackQueue = input.queues?.providerAgentWritebackQueue;
  if (!settings.writeBack.autoWriteBackEnabled || !writebackQueue) {
    return { enqueued: false };
  }

  const actionDefinition = getJobProviderActionDefinition("push_approved_changes");
  if (!actionDefinition) {
    return { enqueued: false };
  }

  const { run: agentRun, reused } = await createOrReuseActivePushApprovedWriteBackAgentRun({
    organizationId: input.organizationId,
    providerKind: input.externalProviderKind,
    externalJobId: input.externalJobId,
    externalTaskId: input.externalTaskId,
    kind: actionDefinition.agentRunKind,
    inputSnapshot: {
      ...actionDefinition.inputSnapshot,
      action: "push_approved_changes",
      hyperlocaliseJobId: input.hyperlocaliseJobId,
      projectId: input.projectId,
      triggeredBy: "tms_automation",
    },
    hyperlocaliseJobId: input.hyperlocaliseJobId,
  });
  if (reused) {
    return { enqueued: false, agentRunId: agentRun.id, reused: true };
  }

  const enqueued = await enqueueAgentRunOrFail({
    organizationId: input.organizationId,
    runId: agentRun.id,
    queueUnavailableMessage: "agent write-back queue unavailable",
    enqueue: () =>
      writebackQueue.enqueue({
        agentRunId: agentRun.id,
        organizationId: input.organizationId,
      }),
  });

  if (!enqueued) {
    return { enqueued: false };
  }

  return { enqueued: true, agentRunId: agentRun.id };
}

async function enqueueAgentRunOrFail(input: {
  organizationId: string;
  runId: string;
  queueUnavailableMessage: string;
  enqueue: () => Promise<unknown>;
}) {
  try {
    await input.enqueue();
    return true;
  } catch (error) {
    await failAgentRun({
      runId: input.runId,
      organizationId: input.organizationId,
      outputSummary: { code: "agent_run_queue_unavailable" },
      warnings: [error instanceof Error ? error.message : input.queueUnavailableMessage],
    });
    return false;
  }
}
