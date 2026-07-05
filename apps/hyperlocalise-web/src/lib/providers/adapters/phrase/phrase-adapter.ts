import { pullPhraseTaskContent } from "@/lib/providers/adapters/phrase/phrase-content-puller";
import { fetchPhraseFileKeys } from "@/lib/providers/adapters/phrase/phrase-file-fetcher";
import { fetchPhraseGlossaries } from "@/lib/providers/adapters/phrase/phrase-glossary-fetcher";
import { fetchPhraseJobTasks } from "@/lib/providers/adapters/phrase/phrase-job-task-fetcher";
import { fetchPhraseProjects } from "@/lib/providers/adapters/phrase/phrase-project-fetcher";
import { pullPhraseProviderReview } from "@/lib/providers/adapters/phrase/phrase-review-puller";
import { uploadPhraseSourceFile } from "@/lib/providers/adapters/phrase/phrase-source-uploader";
import { searchPhraseTranslationMemoryMatches } from "@/lib/providers/adapters/phrase/phrase-tm-matcher";
import { fetchPhraseTranslationMemories } from "@/lib/providers/adapters/phrase/phrase-translation-memory-fetcher";
import { pushPhraseTranslations } from "@/lib/providers/adapters/phrase/phrase-translation-pusher";
import {
  TmsProviderAdapter,
  type TmsProviderAdapterContext,
  type TmsProviderJobScope,
  type TmsProviderProjectScope,
  type TmsProviderPullReviewScope,
  type TmsProviderPushTranslationsScope,
  type TmsProviderSourceFileUploadScope,
} from "@/lib/providers/contracts/tms-provider-adapter";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";

export class PhraseTmsAdapter extends TmsProviderAdapter {
  readonly kind = "phrase" as const;

  fetchProjects(context: TmsProviderAdapterContext) {
    return fetchPhraseProjects({ ...context, providerKind: this.kind });
  }

  fetchFileKeys(scope: TmsProviderProjectScope) {
    return fetchPhraseFileKeys({ ...scope, providerKind: this.kind });
  }

  fetchJobTasks(scope: TmsProviderProjectScope) {
    return fetchPhraseJobTasks({ ...scope, providerKind: this.kind });
  }

  fetchGlossaries(scope: TmsProviderProjectScope) {
    return fetchPhraseGlossaries({ ...scope, providerKind: this.kind });
  }

  fetchTranslationMemories(scope: TmsProviderProjectScope) {
    return fetchPhraseTranslationMemories({ ...scope, providerKind: this.kind });
  }

  pullTaskContent(scope: TmsProviderJobScope) {
    return pullPhraseTaskContent({ ...scope, providerKind: this.kind });
  }

  uploadSourceFile(scope: TmsProviderSourceFileUploadScope) {
    return uploadPhraseSourceFile({ ...scope, providerKind: this.kind });
  }

  pushTranslations(scope: TmsProviderPushTranslationsScope) {
    return pushPhraseTranslations({ ...scope, providerKind: this.kind });
  }

  pullReview(scope: TmsProviderPullReviewScope) {
    return pullPhraseProviderReview({
      credential: scope.credential,
      secretMaterial: scope.secretMaterial,
      externalProjectId: scope.externalProjectId,
      externalJobId: scope.externalJobId,
      project: scope.project,
      content: scope.content,
    });
  }

  searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    return searchPhraseTranslationMemoryMatches(input);
  }
}
