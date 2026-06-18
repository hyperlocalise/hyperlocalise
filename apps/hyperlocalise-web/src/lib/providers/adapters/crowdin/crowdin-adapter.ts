import { pushCrowdinProviderComments } from "@/lib/providers/adapters/crowdin/crowdin-comment-pusher";
import { pullCrowdinTaskContent } from "@/lib/providers/adapters/crowdin/crowdin-content-puller";
import { fetchCrowdinFileKeys } from "@/lib/providers/adapters/crowdin/crowdin-file-fetcher";
import { fetchCrowdinGlossaries } from "@/lib/providers/adapters/crowdin/crowdin-glossary-fetcher";
import { searchCrowdinGlossaryMatches } from "@/lib/providers/adapters/crowdin/crowdin-glossary-matcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/adapters/crowdin/crowdin-job-task-fetcher";
import { fetchCrowdinProjects } from "@/lib/providers/adapters/crowdin/crowdin-project-fetcher";
import { pullCrowdinProviderReview } from "@/lib/providers/adapters/crowdin/crowdin-review-puller";
import { fetchCrowdinTranslationMemories } from "@/lib/providers/adapters/crowdin/crowdin-tm-fetcher";
import { searchCrowdinTranslationMemoryMatches } from "@/lib/providers/adapters/crowdin/crowdin-tm-matcher";
import { pushCrowdinTranslations } from "@/lib/providers/adapters/crowdin/crowdin-translation-pusher";
import {
  TmsProviderAdapter,
  type TmsProviderAdapterContext,
  type TmsProviderCommentPushScope,
  type TmsProviderJobScope,
  type TmsProviderProjectScope,
  type TmsProviderPullReviewScope,
  type TmsProviderPushTranslationsScope,
} from "@/lib/providers/contracts/tms-provider-adapter";
import type { ExternalTmsGlossaryMatcherInput } from "@/lib/providers/contracts/glossary-matcher";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";

export class CrowdinTmsAdapter extends TmsProviderAdapter {
  readonly kind = "crowdin" as const;

  fetchProjects(context: TmsProviderAdapterContext) {
    return fetchCrowdinProjects({ ...context, providerKind: this.kind });
  }

  fetchFileKeys(scope: TmsProviderProjectScope) {
    return fetchCrowdinFileKeys({ ...scope, providerKind: this.kind });
  }

  fetchJobTasks(scope: TmsProviderProjectScope) {
    return fetchCrowdinJobTasks({ ...scope, providerKind: this.kind });
  }

  fetchGlossaries(scope: TmsProviderProjectScope) {
    return fetchCrowdinGlossaries({ ...scope, providerKind: this.kind });
  }

  fetchTranslationMemories(scope: TmsProviderProjectScope) {
    return fetchCrowdinTranslationMemories({ ...scope, providerKind: this.kind });
  }

  pullTaskContent(scope: TmsProviderJobScope) {
    return pullCrowdinTaskContent({ ...scope, providerKind: this.kind });
  }

  pushTranslations(scope: TmsProviderPushTranslationsScope) {
    return pushCrowdinTranslations({ ...scope, providerKind: this.kind });
  }

  pullReview(scope: TmsProviderPullReviewScope) {
    return pullCrowdinProviderReview({
      credential: scope.credential,
      secretMaterial: scope.secretMaterial,
      externalProjectId: scope.externalProjectId,
      externalJobId: scope.externalJobId,
      content: scope.content,
    });
  }

  pushComments(scope: TmsProviderCommentPushScope) {
    return pushCrowdinProviderComments({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      providerKind: this.kind,
      externalProjectId: scope.externalProjectId,
      externalJobId: scope.externalJobId,
      secretMaterial: scope.secretMaterial,
      feedback: scope.feedback,
      knownExternalIds: scope.knownExternalIds,
    });
  }

  searchGlossaryMatches(input: ExternalTmsGlossaryMatcherInput) {
    return searchCrowdinGlossaryMatches(input);
  }

  searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    return searchCrowdinTranslationMemoryMatches(input);
  }
}
