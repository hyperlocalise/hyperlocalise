import { CrowdinTmsAdapter } from "@/lib/providers/adapters/crowdin/crowdin-adapter";
import { LokaliseTmsAdapter } from "@/lib/providers/adapters/lokalise/lokalise-adapter";
import { PhraseTmsAdapter } from "@/lib/providers/adapters/phrase/phrase-adapter";
import { SmartlingTmsAdapter } from "@/lib/providers/adapters/smartling/smartling-adapter";
import type { TmsProviderAdapter } from "@/lib/providers/contracts/tms-provider-adapter";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { ExternalTmsCommentPusher } from "@/lib/providers/provider-feedback-types";
import type {
  ExternalTmsContentPuller,
  ExternalTmsFileKeyFetcher,
  ExternalTmsGlossaryFetcher,
  ExternalTmsJobTaskFetcher,
  ExternalTmsProjectFetcher,
  ExternalTmsReviewPuller,
  ExternalTmsTranslationMemoryFetcher,
  ExternalTmsTranslationPusher,
} from "@/lib/providers/tms-provider-types";
import type { ExternalTmsGlossaryMatcher } from "@/lib/providers/contracts/glossary-matcher";
import type { ExternalTmsTranslationMemoryMatcher } from "@/lib/providers/contracts/translation-memory-matcher";
import {
  adapterSupportsCommentPush,
  adapterSupportsGlossaryMatch,
  adapterSupportsReviewPull,
  adapterSupportsTranslationMemoryMatch,
} from "@/lib/providers/tms-provider-adapter-capabilities";

const crowdinAdapter = new CrowdinTmsAdapter();
const phraseAdapter = new PhraseTmsAdapter();
const lokaliseAdapter = new LokaliseTmsAdapter();
const smartlingAdapter = new SmartlingTmsAdapter();

export const tmsProviderAdapters: Record<ExternalTmsProviderKind, TmsProviderAdapter> = {
  crowdin: crowdinAdapter,
  phrase: phraseAdapter,
  lokalise: lokaliseAdapter,
  smartling: smartlingAdapter,
};

export function getTmsProviderAdapter(providerKind: ExternalTmsProviderKind): TmsProviderAdapter {
  return tmsProviderAdapters[providerKind];
}

function asProjectFetcher(adapter: TmsProviderAdapter): ExternalTmsProjectFetcher {
  return (input) =>
    adapter.fetchProjects({
      organizationId: input.organizationId,
      credential: input.credential,
      secretMaterial: input.secretMaterial,
    });
}

function asFileKeyFetcher(adapter: TmsProviderAdapter): ExternalTmsFileKeyFetcher {
  return (input) =>
    adapter.fetchFileKeys({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asJobTaskFetcher(adapter: TmsProviderAdapter): ExternalTmsJobTaskFetcher {
  return (input) =>
    adapter.fetchJobTasks({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asGlossaryFetcher(adapter: TmsProviderAdapter): ExternalTmsGlossaryFetcher {
  return (input) =>
    adapter.fetchGlossaries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asTranslationMemoryFetcher(
  adapter: TmsProviderAdapter,
): ExternalTmsTranslationMemoryFetcher {
  return (input) =>
    adapter.fetchTranslationMemories({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asContentPuller(adapter: TmsProviderAdapter): ExternalTmsContentPuller {
  return (input) =>
    adapter.pullTaskContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asTranslationPusher(adapter: TmsProviderAdapter): ExternalTmsTranslationPusher {
  return (input) =>
    adapter.pushTranslations({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
      translations: input.translations,
    });
}

function asReviewPuller(adapter: TmsProviderAdapter): ExternalTmsReviewPuller {
  const bound = adapter.pullReview.bind(adapter);
  return async (input) => {
    const report = await bound({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
      content: input.content,
    });
    if (!report) {
      throw new Error(`review_pull_unsupported:${adapter.kind}`);
    }
    return report;
  };
}

function asCommentPusher(adapter: TmsProviderAdapter): ExternalTmsCommentPusher {
  const bound = adapter.pushComments.bind(adapter);
  return async (input) => {
    const result = await bound({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      credential: input.credential,
      secretMaterial: input.secretMaterial,
      feedback: input.feedback,
      knownExternalIds: input.knownExternalIds,
    });
    if (!result) {
      throw new Error(`comment_push_unsupported:${adapter.kind}`);
    }
    return result;
  };
}

function asGlossaryMatcher(adapter: TmsProviderAdapter): ExternalTmsGlossaryMatcher {
  const bound = adapter.searchGlossaryMatches.bind(adapter);
  return async (input) => {
    const matches = await bound(input);
    if (!matches) {
      throw new Error(`glossary_match_unsupported:${adapter.kind}`);
    }
    return matches;
  };
}

function asTranslationMemoryMatcher(
  adapter: TmsProviderAdapter,
): ExternalTmsTranslationMemoryMatcher {
  const bound = adapter.searchTranslationMemoryMatches.bind(adapter);
  return async (input) => {
    const matches = await bound(input);
    if (!matches) {
      throw new Error(`translation_memory_match_unsupported:${adapter.kind}`);
    }
    return matches;
  };
}

export const tmsProviderProjectFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsProjectFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviderAdapters).map(([kind, adapter]) => [kind, asProjectFetcher(adapter)]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsProjectFetcher>>;

export const tmsProviderJobTaskFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviderAdapters).map(([kind, adapter]) => [kind, asJobTaskFetcher(adapter)]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>>;

export const tmsProviderGlossaryFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsGlossaryFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviderAdapters).map(([kind, adapter]) => [kind, asGlossaryFetcher(adapter)]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsGlossaryFetcher>>;

export const tmsProviderTranslationMemoryFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviderAdapters).map(([kind, adapter]) => [
    kind,
    asTranslationMemoryFetcher(adapter),
  ]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>>;

export const tmsProviderFileKeyFetchers = Object.fromEntries(
  Object.entries(tmsProviderAdapters).map(([kind, adapter]) => [kind, asFileKeyFetcher(adapter)]),
) as Record<ExternalTmsProviderKind, ExternalTmsFileKeyFetcher>;

export function getProviderContentPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsContentPuller {
  return asContentPuller(tmsProviderAdapters[providerKind]);
}

export function getProviderTranslationPusher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsTranslationPusher {
  return asTranslationPusher(tmsProviderAdapters[providerKind]);
}

export function providerSupportsReviewPull(providerKind: ExternalTmsProviderKind): boolean {
  return adapterSupportsReviewPull(tmsProviderAdapters[providerKind]);
}

export function providerSupportsCommentPush(providerKind: ExternalTmsProviderKind): boolean {
  return adapterSupportsCommentPush(tmsProviderAdapters[providerKind]);
}

export function providerSupportsGlossaryMatch(providerKind: ExternalTmsProviderKind): boolean {
  return adapterSupportsGlossaryMatch(tmsProviderAdapters[providerKind]);
}

export function providerSupportsTranslationMemoryMatch(
  providerKind: ExternalTmsProviderKind,
): boolean {
  return adapterSupportsTranslationMemoryMatch(tmsProviderAdapters[providerKind]);
}

export function getProviderReviewPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsReviewPuller | null {
  if (!providerSupportsReviewPull(providerKind)) {
    return null;
  }
  return asReviewPuller(tmsProviderAdapters[providerKind]);
}

export function getProviderCommentPusher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsCommentPusher | null {
  if (!providerSupportsCommentPush(providerKind)) {
    return null;
  }
  return asCommentPusher(tmsProviderAdapters[providerKind]);
}

export function getProviderGlossaryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsGlossaryMatcher | null {
  if (!providerSupportsGlossaryMatch(providerKind)) {
    return null;
  }
  return asGlossaryMatcher(tmsProviderAdapters[providerKind]);
}

export function getProviderTranslationMemoryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsTranslationMemoryMatcher | null {
  if (!providerSupportsTranslationMemoryMatch(providerKind)) {
    return null;
  }
  return asTranslationMemoryMatcher(tmsProviderAdapters[providerKind]);
}
