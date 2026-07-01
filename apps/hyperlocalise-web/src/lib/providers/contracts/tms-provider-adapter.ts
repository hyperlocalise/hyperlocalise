import type { schema } from "@/lib/database";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";
import type {
  ExternalTmsApprovedTranslationUpload,
  ExternalTmsFileKeyMetadata,
  ExternalTmsGlossaryMetadata,
  ExternalTmsJobTaskMetadata,
  ExternalTmsProjectMetadata,
  ExternalTmsTaskContent,
  ExternalTmsTranslationMemoryMetadata,
} from "@/lib/providers/tms-provider-types";
import type {
  ProviderCommentChangedItem,
  ProviderQaFeedbackUpload,
} from "@/lib/providers/provider-feedback-types";
import type { ExternalTmsCredential } from "@/lib/providers/organization-external-tms-provider-credentials";

import type { ExternalTmsProviderKind } from "./external-tms-provider-kind";
import type { ExternalTmsGlossaryMatcherInput } from "./glossary-matcher";
import type { NormalizedGlossaryMatch } from "./glossary-match";
import type { ExternalTmsTranslationMemoryMatcherInput } from "./translation-memory-matcher";
import type { NormalizedTranslationMemoryMatch } from "./translation-memory-match";

type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type TmsProviderAdapterContext = {
  organizationId: string;
  credential: ExternalTmsCredential;
  secretMaterial: string;
};

export type TmsProviderProjectScope = TmsProviderAdapterContext & {
  projectId: string;
  externalProjectId: string;
  project: ExternalTmsProject;
};

export type TmsProviderJobScope = TmsProviderProjectScope & {
  externalJobId: string;
};

export type TmsProviderPushTranslationsScope = TmsProviderJobScope & {
  translations: ExternalTmsApprovedTranslationUpload[];
};

export type TmsProviderPullReviewScope = TmsProviderJobScope & {
  content: ExternalTmsTaskContent;
};

export type TmsProviderCommentPushScope = {
  organizationId: string;
  projectId: string;
  externalProjectId: string;
  externalJobId: string;
  credential: Pick<ExternalTmsCredential, "baseUrl">;
  secretMaterial: string;
  feedback: ProviderQaFeedbackUpload[];
  knownExternalIds: Map<string, { issueUid: string; commentUid?: string | null }>;
};

export type TmsProviderPushTranslationsResult = {
  uploaded: number;
  failed: number;
  asyncOperations: Array<Record<string, unknown>>;
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
};

export type TmsProviderCommentPushResult = {
  posted: number;
  skipped: number;
  failed: number;
  changedItems: ProviderCommentChangedItem[];
  failures: Array<{ findingId: string; message: string }>;
};

/**
 * Unified TMS provider surface. Consumers work with normalized data shapes and
 * capability methods — not provider-specific API clients or fetch helpers.
 */
export abstract class TmsProviderAdapter {
  abstract readonly kind: ExternalTmsProviderKind;

  abstract fetchProjects(context: TmsProviderAdapterContext): Promise<ExternalTmsProjectMetadata[]>;

  abstract fetchFileKeys(scope: TmsProviderProjectScope): Promise<ExternalTmsFileKeyMetadata[]>;

  abstract fetchJobTasks(scope: TmsProviderProjectScope): Promise<ExternalTmsJobTaskMetadata[]>;

  abstract fetchGlossaries(scope: TmsProviderProjectScope): Promise<ExternalTmsGlossaryMetadata[]>;

  abstract fetchTranslationMemories(
    scope: TmsProviderProjectScope,
  ): Promise<ExternalTmsTranslationMemoryMetadata[]>;

  abstract pullTaskContent(scope: TmsProviderJobScope): Promise<ExternalTmsTaskContent>;

  abstract pushTranslations(
    scope: TmsProviderPushTranslationsScope,
  ): Promise<TmsProviderPushTranslationsResult>;

  pullReview(_scope: TmsProviderPullReviewScope): Promise<ProviderReviewReport | null> {
    return Promise.resolve(null);
  }

  pushComments(_scope: TmsProviderCommentPushScope): Promise<TmsProviderCommentPushResult | null> {
    return Promise.resolve(null);
  }

  searchGlossaryMatches(
    _input: ExternalTmsGlossaryMatcherInput,
  ): Promise<NormalizedGlossaryMatch[] | null> {
    return Promise.resolve(null);
  }

  searchTranslationMemoryMatches(
    _input: ExternalTmsTranslationMemoryMatcherInput,
  ): Promise<NormalizedTranslationMemoryMatch[] | null> {
    return Promise.resolve(null);
  }
}
