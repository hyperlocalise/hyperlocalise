import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import { lokaliseTmsProvider } from "@/lib/providers/adapters/lokalise/lokalise-provider";
import { phraseTmsProvider } from "@/lib/providers/adapters/phrase/phrase-provider";
import { smartlingTmsProvider } from "@/lib/providers/adapters/smartling/smartling-provider";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  isTmsProviderFeatureSupported,
  TmsProvider,
  type TmsProviderFeatureId,
} from "@/lib/providers/contracts/tms-provider";
import type { ExternalTmsGlossaryMatcher } from "@/lib/providers/contracts/glossary-matcher";
import type { ExternalTmsTranslationMemoryMatcher } from "@/lib/providers/contracts/translation-memory-matcher";
import type { ExternalTmsCommentPusher } from "@/lib/providers/shared/provider-feedback-types";
import type {
  ExternalTmsContentPuller,
  ExternalTmsFileKeyFetcher,
  ExternalTmsGlossaryFetcher,
  ExternalTmsJobTaskCreator,
  ExternalTmsJobTaskFetcher,
  ExternalTmsProjectFetcher,
  ExternalTmsReviewPuller,
  ExternalTmsTranslationMemoryFetcher,
  ExternalTmsTranslationPusher,
} from "@/lib/providers/jobs/tms-provider-types";

export const tmsProviders: Record<ExternalTmsProviderKind, TmsProvider> = {
  crowdin: crowdinTmsProvider,
  phrase: phraseTmsProvider,
  lokalise: lokaliseTmsProvider,
  smartling: smartlingTmsProvider,
};

export function getTmsProvider(providerKind: ExternalTmsProviderKind): TmsProvider {
  return tmsProviders[providerKind];
}

function hasProviderMethodOverride(
  provider: TmsProvider,
  methodName:
    | "pullReview"
    | "pushComments"
    | "createJobTask"
    | "searchGlossaryMatches"
    | "searchTranslationMemoryMatches",
): boolean {
  return provider[methodName] !== TmsProvider.prototype[methodName];
}

export function getTmsProviderFeature(
  providerKind: ExternalTmsProviderKind,
  featureId: TmsProviderFeatureId,
) {
  return getTmsProvider(providerKind).features[featureId];
}

export function providerSupportsFeature(
  providerKind: ExternalTmsProviderKind,
  featureId: TmsProviderFeatureId,
): boolean {
  return isTmsProviderFeatureSupported(getTmsProviderFeature(providerKind, featureId));
}

export function listTmsProviderParityRows() {
  return Object.values(tmsProviders).flatMap((provider) => provider.getParityRows());
}

function asProjectFetcher(provider: TmsProvider): ExternalTmsProjectFetcher {
  return (input) =>
    provider.fetchProjects({
      organizationId: input.organizationId,
      credential: input.credential,
      secretMaterial: input.secretMaterial,
    });
}

function asFileKeyFetcher(provider: TmsProvider): ExternalTmsFileKeyFetcher {
  return (input) =>
    provider.fetchFileKeys({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
      branch: input.branch,
    });
}

function asJobTaskFetcher(provider: TmsProvider): ExternalTmsJobTaskFetcher {
  return (input) =>
    provider.fetchJobTasks({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
      enrichResources: input.enrichResources,
      includeLocaleProgress: input.includeLocaleProgress,
      fetchAllTasks: input.fetchAllTasks,
    });
}

function asJobTaskCreator(provider: TmsProvider): ExternalTmsJobTaskCreator {
  const bound = provider.createJobTask.bind(provider);
  // Callers pass providerKind for routing/logging; the bound provider resolves kind from this.kind.
  return async (input) => {
    const created = await bound({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
      task: input.task,
    });
    if (!created) {
      throw new Error(`task_create_unsupported:${provider.kind}`);
    }
    return created;
  };
}

function asGlossaryFetcher(provider: TmsProvider): ExternalTmsGlossaryFetcher {
  return (input) =>
    provider.fetchGlossaries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asTranslationMemoryFetcher(provider: TmsProvider): ExternalTmsTranslationMemoryFetcher {
  return (input) =>
    provider.fetchTranslationMemories({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asContentPuller(provider: TmsProvider): ExternalTmsContentPuller {
  return (input) =>
    provider.pullTaskContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      credential: input.credential,
      project: input.project,
      secretMaterial: input.secretMaterial,
    });
}

function asTranslationPusher(provider: TmsProvider): ExternalTmsTranslationPusher {
  return (input) =>
    provider.pushTranslations({
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

function asReviewPuller(provider: TmsProvider): ExternalTmsReviewPuller {
  const bound = provider.pullReview.bind(provider);
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
      throw new Error(`review_pull_unsupported:${provider.kind}`);
    }
    return report;
  };
}

function asCommentPusher(provider: TmsProvider): ExternalTmsCommentPusher {
  const bound = provider.pushComments.bind(provider);
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
      throw new Error(`comment_push_unsupported:${provider.kind}`);
    }
    return result;
  };
}

function asGlossaryMatcher(provider: TmsProvider): ExternalTmsGlossaryMatcher {
  const bound = provider.searchGlossaryMatches.bind(provider);
  return async (input) => {
    const matches = await bound(input);
    if (!matches) {
      throw new Error(`glossary_match_unsupported:${provider.kind}`);
    }
    return matches;
  };
}

function asTranslationMemoryMatcher(provider: TmsProvider): ExternalTmsTranslationMemoryMatcher {
  const bound = provider.searchTranslationMemoryMatches.bind(provider);
  return async (input) => {
    const matches = await bound(input);
    if (!matches) {
      throw new Error(`translation_memory_match_unsupported:${provider.kind}`);
    }
    return matches;
  };
}

export const tmsProviderProjectFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsProjectFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviders).map(([kind, provider]) => [kind, asProjectFetcher(provider)]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsProjectFetcher>>;

export const tmsProviderJobTaskFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviders).map(([kind, provider]) => [kind, asJobTaskFetcher(provider)]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>>;

export const tmsProviderGlossaryFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsGlossaryFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviders).map(([kind, provider]) => [kind, asGlossaryFetcher(provider)]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsGlossaryFetcher>>;

export const tmsProviderTranslationMemoryFetchers: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>
> = Object.fromEntries(
  Object.entries(tmsProviders).map(([kind, provider]) => [
    kind,
    asTranslationMemoryFetcher(provider),
  ]),
) as Partial<Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>>;

export const tmsProviderFileKeyFetchers = Object.fromEntries(
  Object.entries(tmsProviders).map(([kind, provider]) => [kind, asFileKeyFetcher(provider)]),
) as Record<ExternalTmsProviderKind, ExternalTmsFileKeyFetcher>;

export function getProviderContentPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsContentPuller {
  return asContentPuller(tmsProviders[providerKind]);
}

export function getProviderTranslationPusher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsTranslationPusher {
  return asTranslationPusher(tmsProviders[providerKind]);
}

export function providerSupportsReviewPull(providerKind: ExternalTmsProviderKind): boolean {
  return (
    providerSupportsFeature(providerKind, "review.pull") &&
    hasProviderMethodOverride(tmsProviders[providerKind], "pullReview")
  );
}

export function providerSupportsCommentPush(providerKind: ExternalTmsProviderKind): boolean {
  return hasProviderMethodOverride(tmsProviders[providerKind], "pushComments");
}

export function providerSupportsTaskCreate(providerKind: ExternalTmsProviderKind): boolean {
  return (
    providerSupportsFeature(providerKind, "tasks.create") &&
    hasProviderMethodOverride(tmsProviders[providerKind], "createJobTask")
  );
}

export function providerSupportsGlossaryMatch(providerKind: ExternalTmsProviderKind): boolean {
  return (
    providerSupportsFeature(providerKind, "glossary.search") &&
    hasProviderMethodOverride(tmsProviders[providerKind], "searchGlossaryMatches")
  );
}

export function providerSupportsTranslationMemoryMatch(
  providerKind: ExternalTmsProviderKind,
): boolean {
  return (
    providerSupportsFeature(providerKind, "translation_memory.search") &&
    hasProviderMethodOverride(tmsProviders[providerKind], "searchTranslationMemoryMatches")
  );
}

export function getProviderReviewPuller(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsReviewPuller | null {
  if (!providerSupportsReviewPull(providerKind)) {
    return null;
  }
  return asReviewPuller(tmsProviders[providerKind]);
}

export function getProviderCommentPusher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsCommentPusher | null {
  if (!providerSupportsCommentPush(providerKind)) {
    return null;
  }
  return asCommentPusher(tmsProviders[providerKind]);
}

export function getProviderJobTaskCreator(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsJobTaskCreator | null {
  if (!providerSupportsTaskCreate(providerKind)) {
    return null;
  }
  return asJobTaskCreator(tmsProviders[providerKind]);
}

export function getProviderGlossaryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsGlossaryMatcher | null {
  if (!providerSupportsGlossaryMatch(providerKind)) {
    return null;
  }
  return asGlossaryMatcher(tmsProviders[providerKind]);
}

export function getProviderTranslationMemoryMatcher(
  providerKind: ExternalTmsProviderKind,
): ExternalTmsTranslationMemoryMatcher | null {
  if (!providerSupportsTranslationMemoryMatch(providerKind)) {
    return null;
  }
  return asTranslationMemoryMatcher(tmsProviders[providerKind]);
}
