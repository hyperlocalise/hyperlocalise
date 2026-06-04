import { fetchCrowdinFileKeys } from "@/lib/providers/adapters/crowdin/crowdin-file-fetcher";
import { fetchCrowdinGlossaries } from "@/lib/providers/adapters/crowdin/crowdin-glossary-fetcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/adapters/crowdin/crowdin-job-task-fetcher";
import { fetchCrowdinProjects } from "@/lib/providers/adapters/crowdin/crowdin-project-fetcher";
import { fetchCrowdinTranslationMemories } from "@/lib/providers/adapters/crowdin/crowdin-tm-fetcher";
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
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type {
  ExternalTmsGlossaryFetcher,
  ExternalTmsJobTaskFetcher,
  ExternalTmsProjectFetcher,
  ExternalTmsTranslationMemoryFetcher,
} from "@/lib/providers/tms-provider-types";

export const tmsProviderProjectFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsProjectFetcher>
> = {
  crowdin: fetchCrowdinProjects,
  lokalise: fetchLokaliseProjects,
  phrase: fetchPhraseProjects,
  smartling: fetchSmartlingProjects,
};

export const tmsProviderJobTaskFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>
> = {
  crowdin: fetchCrowdinJobTasks,
  lokalise: fetchLokaliseJobTasks,
  phrase: fetchPhraseJobTasks,
  smartling: fetchSmartlingJobTasks,
};

export const tmsProviderGlossaryFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsGlossaryFetcher>
> = {
  crowdin: fetchCrowdinGlossaries,
  lokalise: fetchLokaliseGlossaries,
  phrase: fetchPhraseGlossaries,
  smartling: fetchSmartlingGlossaries,
};

export const tmsProviderTranslationMemoryFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>
> = {
  crowdin: fetchCrowdinTranslationMemories,
  lokalise: fetchLokaliseTranslationMemories,
  phrase: fetchPhraseTranslationMemories,
  smartling: fetchSmartlingTranslationMemories,
};

export const tmsProviderFileKeyFetchers = {
  crowdin: fetchCrowdinFileKeys,
  lokalise: fetchLokaliseFileKeys,
  phrase: fetchPhraseFileKeys,
  smartling: fetchSmartlingFileKeys,
} as const;
