import { pushSmartlingProviderComments } from "@/lib/providers/adapters/smartling/smartling-comment-pusher";
import { pullSmartlingTaskContent } from "@/lib/providers/adapters/smartling/smartling-content-puller";
import { fetchSmartlingFileKeys } from "@/lib/providers/adapters/smartling/smartling-file-fetcher";
import { fetchSmartlingGlossaries } from "@/lib/providers/adapters/smartling/smartling-glossary-fetcher";
import { searchSmartlingGlossaryMatches } from "@/lib/providers/adapters/smartling/smartling-glossary-matcher";
import { fetchSmartlingJobTasks } from "@/lib/providers/adapters/smartling/smartling-job-fetcher";
import { fetchSmartlingProjects } from "@/lib/providers/adapters/smartling/smartling-project-fetcher";
import { uploadSmartlingSourceFile } from "@/lib/providers/adapters/smartling/smartling-source-uploader";
import { searchSmartlingTranslationMemoryMatches } from "@/lib/providers/adapters/smartling/smartling-tm-matcher";
import { fetchSmartlingTranslationMemories } from "@/lib/providers/adapters/smartling/smartling-translation-memory-fetcher";
import { pushSmartlingTranslations } from "@/lib/providers/adapters/smartling/smartling-translation-pusher";
import {
  TmsProviderAdapter,
  type TmsProviderAdapterContext,
  type TmsProviderCommentPushScope,
  type TmsProviderJobScope,
  type TmsProviderProjectScope,
  type TmsProviderPushTranslationsScope,
  type TmsProviderSourceFileUploadScope,
} from "@/lib/providers/contracts/tms-provider-adapter";
import type { ExternalTmsGlossaryMatcherInput } from "@/lib/providers/contracts/glossary-matcher";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";

export class SmartlingTmsAdapter extends TmsProviderAdapter {
  readonly kind = "smartling" as const;

  fetchProjects(context: TmsProviderAdapterContext) {
    return fetchSmartlingProjects({ ...context, providerKind: this.kind });
  }

  fetchFileKeys(scope: TmsProviderProjectScope) {
    return fetchSmartlingFileKeys({ ...scope, providerKind: this.kind });
  }

  fetchJobTasks(scope: TmsProviderProjectScope) {
    return fetchSmartlingJobTasks({ ...scope, providerKind: this.kind });
  }

  fetchGlossaries(scope: TmsProviderProjectScope) {
    return fetchSmartlingGlossaries({ ...scope, providerKind: this.kind });
  }

  fetchTranslationMemories(scope: TmsProviderProjectScope) {
    return fetchSmartlingTranslationMemories({ ...scope, providerKind: this.kind });
  }

  pullTaskContent(scope: TmsProviderJobScope) {
    return pullSmartlingTaskContent({ ...scope, providerKind: this.kind });
  }

  uploadSourceFile(scope: TmsProviderSourceFileUploadScope) {
    return uploadSmartlingSourceFile({ ...scope, providerKind: this.kind });
  }

  pushTranslations(scope: TmsProviderPushTranslationsScope) {
    return pushSmartlingTranslations({ ...scope, providerKind: this.kind });
  }

  pushComments(scope: TmsProviderCommentPushScope) {
    return pushSmartlingProviderComments({
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
    return searchSmartlingGlossaryMatches(input);
  }

  searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    return searchSmartlingTranslationMemoryMatches(input);
  }
}
