import { fetchCrowdinFileKeys } from "@/lib/providers/crowdin/crowdin-file-fetcher";
import { fetchCrowdinGlossaries } from "@/lib/providers/crowdin/crowdin-glossary-fetcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/crowdin/crowdin-job-task-fetcher";
import { fetchCrowdinProjects } from "@/lib/providers/crowdin/crowdin-project-fetcher";
import { fetchCrowdinTranslationMemories } from "@/lib/providers/crowdin/crowdin-tm-fetcher";
import {
  pullExternalTmsTaskContent,
  pushExternalTmsTranslations,
} from "@/lib/providers/external-tms-content-sync";
import { syncExternalTmsFileKeys } from "@/lib/providers/external-tms-file-sync";
import { syncExternalTmsGlossaries } from "@/lib/providers/external-tms-glossary-sync";
import { syncExternalTmsJobTasks } from "@/lib/providers/external-tms-job-sync";
import { syncExternalTmsProjects } from "@/lib/providers/external-tms-project-sync";
import { syncExternalTmsTranslationMemories } from "@/lib/providers/external-tms-tm-sync";
import { fetchLokaliseFileKeys } from "@/lib/providers/lokalise/lokalise-file-fetcher";
import { fetchLokaliseGlossaries } from "@/lib/providers/lokalise/lokalise-glossary-fetcher";
import { fetchLokaliseJobTasks } from "@/lib/providers/lokalise/lokalise-job-task-fetcher";
import { fetchLokaliseProjects } from "@/lib/providers/lokalise/lokalise-project-fetcher";
import { fetchLokaliseTranslationMemories } from "@/lib/providers/lokalise/lokalise-translation-memory-fetcher";
import { fetchPhraseFileKeys } from "@/lib/providers/phrase/phrase-file-fetcher";
import { fetchPhraseGlossaries } from "@/lib/providers/phrase/phrase-glossary-fetcher";
import { fetchPhraseJobTasks } from "@/lib/providers/phrase/phrase-job-task-fetcher";
import { fetchPhraseProjects } from "@/lib/providers/phrase/phrase-project-fetcher";
import { fetchPhraseTranslationMemories } from "@/lib/providers/phrase/phrase-translation-memory-fetcher";
import { fetchSmartlingFileKeys } from "@/lib/providers/smartling/smartling-file-fetcher";
import { fetchSmartlingGlossaries } from "@/lib/providers/smartling/smartling-glossary-fetcher";
import { fetchSmartlingJobTasks } from "@/lib/providers/smartling/smartling-job-fetcher";
import { fetchSmartlingProjects } from "@/lib/providers/smartling/smartling-project-fetcher";
import { fetchSmartlingTranslationMemories } from "@/lib/providers/smartling/smartling-translation-memory-fetcher";

import type { ProviderSyncIntent } from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { getProviderContentPuller } from "./provider-content-pullers";
import type { ProviderSyncIntentKind } from "./provider-sync-intent-kinds";
import { getProviderTranslationPusher } from "./provider-translation-pushers";

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

      const result = await pushExternalTmsTranslations({
        organizationId: intent.organizationId,
        projectId: requireProjectId(intent),
        providerKind: intent.providerKind,
        externalJobId: resolveExternalJobId(intent),
        translations: [],
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
