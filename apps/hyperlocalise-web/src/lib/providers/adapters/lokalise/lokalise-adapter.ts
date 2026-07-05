import { pushLokaliseProviderComments } from "@/lib/providers/adapters/lokalise/lokalise-comment-pusher";
import { pullLokaliseTaskContent } from "@/lib/providers/adapters/lokalise/lokalise-content-puller";
import { fetchLokaliseFileKeys } from "@/lib/providers/adapters/lokalise/lokalise-file-fetcher";
import { fetchLokaliseGlossaries } from "@/lib/providers/adapters/lokalise/lokalise-glossary-fetcher";
import { searchLokaliseGlossaryMatches } from "@/lib/providers/adapters/lokalise/lokalise-glossary-matcher";
import { fetchLokaliseJobTasks } from "@/lib/providers/adapters/lokalise/lokalise-job-task-fetcher";
import { fetchLokaliseProjects } from "@/lib/providers/adapters/lokalise/lokalise-project-fetcher";
import { pullLokaliseProviderReview } from "@/lib/providers/adapters/lokalise/lokalise-review-puller";
import { uploadLokaliseSourceFile } from "@/lib/providers/adapters/lokalise/lokalise-source-uploader";
import { searchLokaliseTranslationMemoryMatches } from "@/lib/providers/adapters/lokalise/lokalise-tm-matcher";
import { fetchLokaliseTranslationMemories } from "@/lib/providers/adapters/lokalise/lokalise-translation-memory-fetcher";
import { pushLokaliseTranslations } from "@/lib/providers/adapters/lokalise/lokalise-translation-pusher";
import {
  TmsProviderAdapter,
  type TmsProviderAdapterContext,
  type TmsProviderCommentPushScope,
  type TmsProviderJobScope,
  type TmsProviderProjectScope,
  type TmsProviderPullReviewScope,
  type TmsProviderPushTranslationsScope,
  type TmsProviderSourceFileUploadScope,
} from "@/lib/providers/contracts/tms-provider-adapter";
import type { ExternalTmsGlossaryMatcherInput } from "@/lib/providers/contracts/glossary-matcher";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";

export class LokaliseTmsAdapter extends TmsProviderAdapter {
  readonly kind = "lokalise" as const;

  fetchProjects(context: TmsProviderAdapterContext) {
    return fetchLokaliseProjects({ ...context, providerKind: this.kind });
  }

  fetchFileKeys(scope: TmsProviderProjectScope) {
    return fetchLokaliseFileKeys({ ...scope, providerKind: this.kind });
  }

  fetchJobTasks(scope: TmsProviderProjectScope) {
    return fetchLokaliseJobTasks({ ...scope, providerKind: this.kind });
  }

  fetchGlossaries(scope: TmsProviderProjectScope) {
    return fetchLokaliseGlossaries({ ...scope, providerKind: this.kind });
  }

  fetchTranslationMemories(scope: TmsProviderProjectScope) {
    return fetchLokaliseTranslationMemories({ ...scope, providerKind: this.kind });
  }

  pullTaskContent(scope: TmsProviderJobScope) {
    return pullLokaliseTaskContent({ ...scope, providerKind: this.kind });
  }

  uploadSourceFile(scope: TmsProviderSourceFileUploadScope) {
    return uploadLokaliseSourceFile({ ...scope, providerKind: this.kind });
  }

  pushTranslations(scope: TmsProviderPushTranslationsScope) {
    return pushLokaliseTranslations({ ...scope, providerKind: this.kind });
  }

  pullReview(scope: TmsProviderPullReviewScope) {
    return pullLokaliseProviderReview({
      credential: scope.credential,
      secretMaterial: scope.secretMaterial,
      externalProjectId: scope.externalProjectId,
      externalJobId: scope.externalJobId,
      content: scope.content,
    });
  }

  pushComments(scope: TmsProviderCommentPushScope) {
    return pushLokaliseProviderComments({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      providerKind: this.kind,
      externalProjectId: scope.externalProjectId,
      externalJobId: scope.externalJobId,
      credential: scope.credential,
      secretMaterial: scope.secretMaterial,
      feedback: scope.feedback,
      knownExternalIds: scope.knownExternalIds,
    });
  }

  searchGlossaryMatches(input: ExternalTmsGlossaryMatcherInput) {
    return searchLokaliseGlossaryMatches(input);
  }

  searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    return searchLokaliseTranslationMemoryMatches(input);
  }
}
