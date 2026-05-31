import { fetchCrowdinFileKeys } from "@/lib/providers/adapters/crowdin/crowdin-file-fetcher";
import { fetchCrowdinGlossaries } from "@/lib/providers/adapters/crowdin/crowdin-glossary-fetcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/adapters/crowdin/crowdin-job-task-fetcher";
import { fetchCrowdinProjects } from "@/lib/providers/adapters/crowdin/crowdin-project-fetcher";
import { fetchCrowdinTranslationMemories } from "@/lib/providers/adapters/crowdin/crowdin-tm-fetcher";
import {
  pullExternalTmsTaskContent,
  pushExternalTmsTranslations,
} from "@/lib/providers/sync/external-tms-content-sync";
import { syncExternalTmsFileKeys } from "@/lib/providers/sync/external-tms-file-sync";
import { syncExternalTmsGlossaries } from "@/lib/providers/sync/external-tms-glossary-sync";
import { syncExternalTmsJobTasks } from "@/lib/providers/sync/external-tms-job-sync";
import { syncExternalTmsProjects } from "@/lib/providers/sync/external-tms-project-sync";
import { syncExternalTmsTranslationMemories } from "@/lib/providers/sync/external-tms-tm-sync";
import { fetchLokaliseFileKeys } from "@/lib/providers/adapters/lokalise/lokalise-file-fetcher";
import { fetchLokaliseGlossaries } from "@/lib/providers/adapters/lokalise/lokalise-glossary-fetcher";
import { fetchLokaliseJobTasks } from "@/lib/providers/adapters/lokalise/lokalise-job-task-fetcher";
import { fetchLokaliseProjects } from "@/lib/providers/adapters/lokalise/lokalise-project-fetcher";
import { fetchLokaliseTranslationMemories } from "@/lib/providers/adapters/lokalise/lokalise-translation-memory-fetcher";
import { fetchPhraseFileKeys } from "@/lib/providers/adapters/phrase/phrase-file-fetcher";
import { fetchPhraseGlossaries } from "@/lib/providers/adapters/phrase/phrase-glossary-fetcher";
import { fetchPhraseJobTasks } from "@/lib/providers/adapters/phrase/phrase-job-task-fetcher";
import { fetchPhraseProjects } from "@/lib/providers/adapters/phrase/phrase-project-fetcher";
import { fetchPhraseTranslationMemories } from "@/lib/providers/adapters/phrase/phrase-translation-memory-fetcher";
import { fetchSmartlingFileKeys } from "@/lib/providers/adapters/smartling/smartling-file-fetcher";
import { fetchSmartlingGlossaries } from "@/lib/providers/adapters/smartling/smartling-glossary-fetcher";
import { fetchSmartlingJobTasks } from "@/lib/providers/adapters/smartling/smartling-job-fetcher";
import { fetchSmartlingProjects } from "@/lib/providers/adapters/smartling/smartling-project-fetcher";
import { fetchSmartlingTranslationMemories } from "@/lib/providers/adapters/smartling/smartling-translation-memory-fetcher";

import type { ProviderSyncIntent } from "@/lib/database/types";

import { collectAcceptedAgentRunProposalsForJob } from "../agent-runs/agent-run-proposals";
import { listAgentRuns } from "../agent-runs/agent-runs";
import type { ExternalTmsProviderKind } from "../organization-external-tms-provider-credentials";
import { getExternalJobByProviderJobId } from "./organization-external-tms-jobs";
import { getProviderContentPuller } from "../provider-content-pullers";
import type { ProviderSyncIntentKind } from "./provider-sync-intent-kinds";
import { getProviderTranslationPusher } from "../provider-translation-pushers";
import type { ExternalTmsApprovedTranslationUpload } from "./external-tms-content-sync";

export type ProviderSyncIntentDispatchResult = {
  runId: string;
  status: "succeeded" | "failed";
  runner: ProviderSyncIntentKind;
};

export type ProviderSyncIntentDispatcher = {
  dispatch(intent: ProviderSyncIntent): Promise<ProviderSyncIntentDispatchResult>;
};

export function resolveProviderSyncDispatchRunner(syncKind: ProviderSyncIntentKind) {
  return syncKind;
}

function requireProjectId(intent: ProviderSyncIntent) {
  if (!intent.projectId) {
    throw new Error("provider_sync_intent_missing_project_id");
  }

  return intent.projectId;
}

function resolveExternalJobId(intent: ProviderSyncIntent) {
  const externalJobId = intent.resourceId ?? intent.resourceIds[0] ?? null;
  if (!externalJobId) {
    throw new Error("provider_sync_intent_missing_external_job_id");
  }

  return externalJobId;
}

const PROVIDER_SYNC_AGENT_RUNS_PAGE_SIZE = 200;

async function listAllAgentRunsForProviderJob(input: {
  organizationId: string;
  hyperlocaliseJobId: string;
}) {
  const runs: Awaited<ReturnType<typeof listAgentRuns>> = [];
  let offset = 0;

  while (true) {
    const page = await listAgentRuns({
      organizationId: input.organizationId,
      hyperlocaliseJobId: input.hyperlocaliseJobId,
      limit: PROVIDER_SYNC_AGENT_RUNS_PAGE_SIZE,
      offset,
    });

    runs.push(...page);

    if (page.length < PROVIDER_SYNC_AGENT_RUNS_PAGE_SIZE) {
      break;
    }

    offset += PROVIDER_SYNC_AGENT_RUNS_PAGE_SIZE;
  }

  return runs;
}

export async function loadProviderSyncIntentApprovedTranslations(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
}): Promise<ExternalTmsApprovedTranslationUpload[]> {
  const externalJob = await getExternalJobByProviderJobId(input);

  if (!externalJob) {
    return [];
  }

  const details = externalJob.external_job_details;
  const hyperlocaliseJobIds = [
    ...new Set(
      [details.jobId, details.linkedJobId].filter(
        (jobId): jobId is string => typeof jobId === "string" && jobId.length > 0,
      ),
    ),
  ];
  const runs = (
    await Promise.all(
      hyperlocaliseJobIds.map((hyperlocaliseJobId) =>
        listAllAgentRunsForProviderJob({
          organizationId: input.organizationId,
          hyperlocaliseJobId,
        }),
      ),
    )
  ).flat();

  return collectAcceptedAgentRunProposalsForJob({ runs }).map((proposal) => ({
    externalStringId: proposal.externalStringId,
    key: proposal.key,
    locale: proposal.locale,
    text: proposal.to,
  }));
}

const projectFetchers: Partial<
  Record<ExternalTmsProviderKind, Parameters<typeof syncExternalTmsProjects>[0]["fetchProjects"]>
> = {
  crowdin: fetchCrowdinProjects,
  lokalise: fetchLokaliseProjects,
  phrase: fetchPhraseProjects,
  smartling: fetchSmartlingProjects,
};

const fileKeyFetchers: Partial<
  Record<ExternalTmsProviderKind, Parameters<typeof syncExternalTmsFileKeys>[0]["fetchFileKeys"]>
> = {
  crowdin: fetchCrowdinFileKeys,
  lokalise: fetchLokaliseFileKeys,
  phrase: fetchPhraseFileKeys,
  smartling: fetchSmartlingFileKeys,
};

const jobTaskFetchers: Partial<
  Record<ExternalTmsProviderKind, Parameters<typeof syncExternalTmsJobTasks>[0]["fetchJobTasks"]>
> = {
  crowdin: fetchCrowdinJobTasks,
  lokalise: fetchLokaliseJobTasks,
  phrase: fetchPhraseJobTasks,
  smartling: fetchSmartlingJobTasks,
};

const glossaryFetchers: Partial<
  Record<
    ExternalTmsProviderKind,
    Parameters<typeof syncExternalTmsGlossaries>[0]["fetchGlossaries"]
  >
> = {
  crowdin: fetchCrowdinGlossaries,
  lokalise: fetchLokaliseGlossaries,
  phrase: fetchPhraseGlossaries,
  smartling: fetchSmartlingGlossaries,
};

const translationMemoryFetchers: Partial<
  Record<
    ExternalTmsProviderKind,
    Parameters<typeof syncExternalTmsTranslationMemories>[0]["fetchTranslationMemories"]
  >
> = {
  crowdin: fetchCrowdinTranslationMemories,
  lokalise: fetchLokaliseTranslationMemories,
  phrase: fetchPhraseTranslationMemories,
  smartling: fetchSmartlingTranslationMemories,
};

export async function dispatchProviderSyncIntent(
  intent: ProviderSyncIntent,
): Promise<ProviderSyncIntentDispatchResult> {
  const syncKind = intent.syncKind as ProviderSyncIntentKind;
  const runner = resolveProviderSyncDispatchRunner(syncKind);

  switch (syncKind) {
    case "project_scan": {
      const fetchProjects = projectFetchers[intent.providerKind];
      if (!fetchProjects) {
        throw new Error("provider_sync_not_implemented");
      }

      const result = await syncExternalTmsProjects({
        organizationId: intent.organizationId,
        providerKind: intent.providerKind,
        fetchProjects,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    case "file_key_scan": {
      const fetchFileKeys = fileKeyFetchers[intent.providerKind];
      if (!fetchFileKeys) {
        throw new Error("provider_sync_not_implemented");
      }

      const result = await syncExternalTmsFileKeys({
        organizationId: intent.organizationId,
        projectId: requireProjectId(intent),
        providerKind: intent.providerKind,
        fetchFileKeys,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    case "job_task_scan": {
      const fetchJobTasks = jobTaskFetchers[intent.providerKind];
      if (!fetchJobTasks) {
        throw new Error("provider_sync_not_implemented");
      }

      const result = await syncExternalTmsJobTasks({
        organizationId: intent.organizationId,
        projectId: requireProjectId(intent),
        providerKind: intent.providerKind,
        fetchJobTasks,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    case "glossary_scan": {
      const fetchGlossaries = glossaryFetchers[intent.providerKind];
      if (!fetchGlossaries) {
        throw new Error("provider_sync_not_implemented");
      }

      const result = await syncExternalTmsGlossaries({
        organizationId: intent.organizationId,
        projectId: requireProjectId(intent),
        providerKind: intent.providerKind,
        fetchGlossaries,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    case "tm_scan": {
      const fetchTranslationMemories = translationMemoryFetchers[intent.providerKind];
      if (!fetchTranslationMemories) {
        throw new Error("provider_sync_not_implemented");
      }

      const result = await syncExternalTmsTranslationMemories({
        organizationId: intent.organizationId,
        projectId: requireProjectId(intent),
        providerKind: intent.providerKind,
        fetchTranslationMemories,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    case "pull_content": {
      const pullContent = getProviderContentPuller(intent.providerKind);
      if (!pullContent) {
        throw new Error("provider_sync_not_implemented");
      }

      const result = await pullExternalTmsTaskContent({
        organizationId: intent.organizationId,
        projectId: requireProjectId(intent),
        providerKind: intent.providerKind,
        externalJobId: resolveExternalJobId(intent),
        pullContent,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    case "push_translations": {
      const pushTranslations = getProviderTranslationPusher(intent.providerKind);
      if (!pushTranslations) {
        throw new Error("provider_sync_not_implemented");
      }
      const projectId = requireProjectId(intent);
      const externalJobId = resolveExternalJobId(intent);
      const translations = await loadProviderSyncIntentApprovedTranslations({
        organizationId: intent.organizationId,
        projectId,
        providerKind: intent.providerKind,
        externalJobId,
      });

      const result = await pushExternalTmsTranslations({
        organizationId: intent.organizationId,
        projectId,
        providerKind: intent.providerKind,
        externalJobId,
        translations,
        pushTranslations,
      });

      return { runId: result.runId, status: result.status, runner };
    }
    default: {
      const _exhaustive: never = syncKind;
      throw new Error(`unsupported_provider_sync_intent_kind:${String(_exhaustive)}`);
    }
  }
}

export function createDefaultProviderSyncIntentDispatcher(): ProviderSyncIntentDispatcher {
  return {
    dispatch: dispatchProviderSyncIntent,
  };
}
