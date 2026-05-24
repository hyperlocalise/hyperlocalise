import type {
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
} from "@/lib/workflow/types";

import { createAgentRun } from "./agent-runs";
import { getJobProviderActionDefinition } from "./job-provider-actions";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { resolveEffectiveTmsAgentAutomationSettings } from "./tms-agent-automation-settings-store";
import {
  shouldAutoDraftTranslationForLocale,
  shouldAutoRunQaOnSyncedJob,
} from "./tms-agent-automation-settings";

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

  if (shouldAutoRunQaOnSyncedJob(settings) && input.queues?.providerAgentQaQueue) {
    const qaRun = await createAutomationAgentRun({
      ...input,
      action: "run_qa_checks",
    });

    if (qaRun) {
      await input.queues.providerAgentQaQueue.enqueue({
        agentRunId: qaRun.id,
        organizationId: input.organizationId,
      });
      triggered.push("run_qa_checks");
    }
  }

  if (
    settings.autoDraftTranslations.enabled &&
    input.queues?.providerAgentTranslationQueue &&
    input.targetLocales.some((locale) => shouldAutoDraftTranslationForLocale(settings, locale))
  ) {
    const translateRun = await createAutomationAgentRun({
      ...input,
      action: "translate_with_agent",
      automationLocales: settings.autoDraftTranslations.locales,
    });

    if (translateRun) {
      await input.queues.providerAgentTranslationQueue.enqueue({
        agentRunId: translateRun.id,
        organizationId: input.organizationId,
      });
      triggered.push("translate_with_agent");
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

  if (!settings.writeBack.autoWriteBackEnabled || !input.queues?.providerAgentWritebackQueue) {
    return { enqueued: false };
  }

  const actionDefinition = getJobProviderActionDefinition("push_approved_changes");
  if (!actionDefinition) {
    return { enqueued: false };
  }

  const agentRun = await createAgentRun({
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

  await input.queues.providerAgentWritebackQueue.enqueue({
    agentRunId: agentRun.id,
    organizationId: input.organizationId,
  });

  return { enqueued: true, agentRunId: agentRun.id };
}
