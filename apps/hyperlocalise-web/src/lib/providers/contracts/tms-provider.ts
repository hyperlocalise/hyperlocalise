import type { schema } from "@/lib/database";
import type { Result } from "@/lib/primitives/result/results";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";
import type {
  ExternalTmsApprovedTranslationUpload,
  ExternalTmsFileKeyMetadata,
  ExternalTmsGlossaryMetadata,
  ExternalTmsJobTaskMetadata,
  ExternalTmsProjectMetadata,
  ExternalTmsSourceFileUpload,
  ExternalTmsSourceFileUploadError,
  ExternalTmsSourceFileUploadResult,
  ExternalTmsTaskContent,
  ExternalTmsTranslationMemoryMetadata,
} from "@/lib/providers/jobs/tms-provider-types";
import type {
  ProviderCommentChangedItem,
  ProviderQaFeedbackUpload,
} from "@/lib/providers/shared/provider-feedback-types";
import type { ExternalTmsCredential } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

import type { ExternalTmsProviderKind } from "./external-tms-provider-kind";
import type { ExternalTmsGlossaryMatcherInput } from "./glossary-matcher";
import type { NormalizedGlossaryMatch } from "./glossary-match";
import type { ExternalTmsTranslationMemoryMatcherInput } from "./translation-memory-matcher";
import type { NormalizedTranslationMemoryMatch } from "./translation-memory-match";

type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type TmsProviderContext = {
  organizationId: string;
  credential: ExternalTmsCredential;
  secretMaterial: string;
};

export type TmsProviderProjectScope = TmsProviderContext & {
  projectId: string;
  externalProjectId: string;
  project: ExternalTmsProject;
  branch?: string | null;
  enrichResources?: boolean;
  includeLocaleProgress?: boolean;
  fetchAllTasks?: boolean;
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

export type TmsProviderSourceFileUploadScope = TmsProviderProjectScope & {
  file: ExternalTmsSourceFileUpload;
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

export const tmsProviderFeatureIds = [
  "projects.read",
  "projects.write",
  "locales.read",
  "locales.write",
  "files.upload",
  "files.download",
  "keys.read",
  "keys.write",
  "jobs.create",
  "jobs.read",
  "tasks.create",
  "tasks.read",
  "comments.read",
  "comments.write",
  "status_transitions.read",
  "status_transitions.write",
  "translation_memory.import",
  "translation_memory.export",
  "translation_memory.search",
  "glossary.import",
  "glossary.export",
  "glossary.search",
  "qa.run",
  "review.pull",
  "webhooks.receive",
  "webhooks.configure",
  "write_back.source",
  "write_back.translation",
  "cat.open",
  "cat.visual_context",
  "auth.user_scoped",
] as const;

export type TmsProviderFeatureId = (typeof tmsProviderFeatureIds)[number];

export type TmsProviderFeatureState = "implemented" | "partial" | "planned" | "unsupported";

export type TmsProviderFeature = {
  state: TmsProviderFeatureState;
  label?: string;
  note?: string;
  disabledReason?: string;
};

export type TmsProviderAuthModel = {
  workspaceCredential: boolean;
  userConnection: boolean;
  note?: string;
};

export type TmsProviderResourceSupport = {
  providerCat: {
    file: boolean;
    key: boolean;
  };
};

export type TmsProviderParityRow = {
  providerKind: ExternalTmsProviderKind;
  providerLabel: string;
  featureId: TmsProviderFeatureId;
  state: TmsProviderFeatureState;
  label: string;
  note?: string;
  disabledReason?: string;
};

export const tmsProviderFeatureLabels = {
  "projects.read": "Read projects",
  "projects.write": "Manage projects",
  "locales.read": "Read locales",
  "locales.write": "Manage locales",
  "files.upload": "Upload files",
  "files.download": "Download files",
  "keys.read": "Read keys",
  "keys.write": "Manage keys",
  "jobs.create": "Create jobs",
  "jobs.read": "Read jobs",
  "tasks.create": "Create tasks",
  "tasks.read": "Read tasks",
  "comments.read": "Read comments",
  "comments.write": "Write comments",
  "status_transitions.read": "Read status transitions",
  "status_transitions.write": "Apply status transitions",
  "translation_memory.import": "Import translation memory",
  "translation_memory.export": "Export translation memory",
  "translation_memory.search": "Search translation memory",
  "glossary.import": "Import glossary terms",
  "glossary.export": "Export glossary terms",
  "glossary.search": "Search glossary terms",
  "qa.run": "Run QA checks",
  "review.pull": "Pull provider review",
  "webhooks.receive": "Receive webhooks",
  "webhooks.configure": "Configure webhooks",
  "write_back.source": "Write source content back",
  "write_back.translation": "Write translations back",
  "cat.open": "Open CAT workspace",
  "cat.visual_context": "Load CAT visual context",
  "auth.user_scoped": "Use user-scoped auth",
} as const satisfies Record<TmsProviderFeatureId, string>;

export function isTmsProviderFeatureSupported(feature: TmsProviderFeature): boolean {
  return feature.state === "implemented" || feature.state === "partial";
}

export abstract class TmsProvider {
  abstract readonly kind: ExternalTmsProviderKind;
  abstract readonly label: string;
  abstract readonly auth: TmsProviderAuthModel;
  abstract readonly resourceSupport: TmsProviderResourceSupport;
  abstract readonly features: Record<TmsProviderFeatureId, TmsProviderFeature>;

  abstract fetchProjects(context: TmsProviderContext): Promise<ExternalTmsProjectMetadata[]>;

  abstract fetchFileKeys(scope: TmsProviderProjectScope): Promise<ExternalTmsFileKeyMetadata[]>;

  abstract fetchJobTasks(scope: TmsProviderProjectScope): Promise<ExternalTmsJobTaskMetadata[]>;

  abstract fetchGlossaries(scope: TmsProviderProjectScope): Promise<ExternalTmsGlossaryMetadata[]>;

  abstract fetchTranslationMemories(
    scope: TmsProviderProjectScope,
  ): Promise<ExternalTmsTranslationMemoryMetadata[]>;

  abstract pullTaskContent(scope: TmsProviderJobScope): Promise<ExternalTmsTaskContent>;

  abstract uploadSourceFile(
    scope: TmsProviderSourceFileUploadScope,
  ): Promise<Result<ExternalTmsSourceFileUploadResult, ExternalTmsSourceFileUploadError>>;

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

  getParityRows(): TmsProviderParityRow[] {
    return tmsProviderFeatureIds.map((featureId) => {
      const feature = this.features[featureId];

      return {
        providerKind: this.kind,
        providerLabel: this.label,
        featureId,
        state: feature.state,
        label: feature.label ?? tmsProviderFeatureLabels[featureId],
        ...(feature.note ? { note: feature.note } : {}),
        ...(feature.disabledReason ? { disabledReason: feature.disabledReason } : {}),
      };
    });
  }
}
