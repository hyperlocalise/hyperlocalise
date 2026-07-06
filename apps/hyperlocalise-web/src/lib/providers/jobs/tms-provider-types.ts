import type { JobKind } from "@/lib/database/types";
import type { schema } from "@/lib/database";
import type { Result } from "@/lib/primitives/result/results";

import type {
  ExternalTmsCredential,
  ExternalTmsProviderKind,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsTerminologyResourceType = "glossary" | "term_base";

export type ExternalTmsProjectMetadata = {
  externalProjectId: string;
  name: string;
  sourceLocale?: string | null;
  targetLocales?: string[];
  externalProjectUrl?: string | null;
  isActive?: boolean;
  logoUrl?: string | null;
  lastActivityAt?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsProjectFetcher = (input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credential: ExternalTmsCredential;
  secretMaterial: string;
}) => Promise<ExternalTmsProjectMetadata[]>;

export type ExternalTmsFileKeyMetadata = {
  externalResourceId: string;
  resourceType: "file" | "key";
  sourcePath: string;
  displayName?: string | null;
  format?: string | null;
  sourceLocale?: string | null;
  targetLocales?: string[];
  sourceHash?: string | null;
  revision?: string | null;
  externalUrl?: string | null;
  syncState?: string;
  localeReadiness?: Record<string, unknown>;
  providerPayload?: Record<string, unknown>;
  syncErrorMessage?: string | null;
};

export type ExternalTmsFileKeyFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
  /** When set, only files for this provider branch are listed (Crowdin, Phrase). */
  branch?: string | null;
}) => Promise<ExternalTmsFileKeyMetadata[]>;

export type ExternalTmsSourceFileUpload = {
  sourcePath: string;
  filename: string;
  contentType: string;
  content: Uint8Array;
  sourceHash?: string | null;
  sourceLocale?: string | null;
  format?: string | null;
  branch?: string | null;
};

export type ExternalTmsSourceFileUploadResult = {
  sourcePath: string;
  externalResourceId?: string | null;
  revision?: string | null;
  asyncOperation?: Record<string, unknown> | null;
  providerPayload?: Record<string, unknown>;
};

export type ExternalTmsSourceFileUploadError =
  | { code: "invalid_crowdin_project_id" }
  | { code: "crowdin_branch_not_found" }
  | { code: "phrase_source_locale_not_found" }
  | { code: "phrase_source_file_format_required" }
  | { code: "lokalise_source_locale_required" }
  | { code: "lokalise_source_file_format_required" }
  | { code: "smartling_source_file_type_required" };

export type ExternalTmsSourceFileUploader = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
  file: ExternalTmsSourceFileUpload;
}) => Promise<Result<ExternalTmsSourceFileUploadResult, ExternalTmsSourceFileUploadError>>;

export type ExternalTmsJobTaskMetadata = {
  externalJobId: string;
  externalTaskId?: string | null;
  externalStatus: string;
  title?: string | null;
  dueDate?: Date | string | null;
  targetLocales?: string[];
  assignedUsers?: string[];
  completedAt?: Date | string | null;
  externalUrl?: string | null;
  providerPayload?: Record<string, unknown>;
  kind?: JobKind;
};

export type ExternalTmsJobTaskFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
  enrichResources?: boolean;
  includeLocaleProgress?: boolean;
  fetchAllTasks?: boolean;
}) => Promise<ExternalTmsJobTaskMetadata[]>;

export type ExternalTmsGlossaryTermMetadata = {
  externalKey: string;
  sourceTerm: string;
  targetTerm: string;
  description?: string;
  partOfSpeech?: string;
  status?: string | null;
  forbidden?: boolean | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsGlossaryMetadata = {
  externalGlossaryId: string;
  name: string;
  description?: string;
  sourceLocale: string;
  targetLocale: string;
  externalResourceType?: ExternalTmsTerminologyResourceType;
  localeCoverage?: string[];
  termCount?: number | null;
  externalUrl?: string | null;
  termCapabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  syncErrorMessage?: string | null;
  terms?: ExternalTmsGlossaryTermMetadata[];
};

export type ExternalTmsGlossaryFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsGlossaryMetadata[]>;

export type ExternalTmsTranslationMemoryEntryMetadata = {
  externalKey: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore?: number;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsTranslationMemoryMetadata = {
  externalMemoryId: string;
  name: string;
  description?: string;
  sourceLocale: string;
  localeCoverage?: string[];
  segmentCount?: number | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown>;
  syncErrorMessage?: string | null;
  entries?: ExternalTmsTranslationMemoryEntryMetadata[];
};

export type ExternalTmsTranslationMemoryFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsTranslationMemoryMetadata[]>;

export type ExternalTmsTranslationUnit = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context?: string | null;
  fileId?: string | null;
  translations: Array<{
    locale: string;
    text: string;
    externalTranslationId?: string | null;
    isApproved?: boolean;
  }>;
  providerPayload?: Record<string, unknown>;
};

export type ExternalTmsTaskContent = {
  externalJobId: string;
  externalTaskId?: string | null;
  sourceLocale?: string | null;
  targetLocales: string[];
  units: ExternalTmsTranslationUnit[];
  exportArtifact?: {
    url: string;
    format?: string | null;
    byteLength?: number | null;
  } | null;
  providerPayload?: Record<string, unknown>;
};

export type ExternalTmsApprovedTranslationUpload = {
  externalStringId?: string | null;
  key?: string | null;
  locale: string;
  text: string;
  fileId?: string | null;
  fileName?: string | null;
  format?: string | null;
};

export type ExternalTmsContentPuller = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsTaskContent>;

export type ExternalTmsTranslationPusher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
  translations: ExternalTmsApprovedTranslationUpload[];
}) => Promise<{
  uploaded: number;
  failed: number;
  asyncOperations: Array<Record<string, unknown>>;
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
}>;

export type ExternalTmsReviewPuller = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: ExternalTmsCredential;
  secretMaterial: string;
  project: ExternalTmsProject;
  content: ExternalTmsTaskContent;
}) => Promise<ProviderReviewReport>;

export type ExternalTmsContentSyncFailure = {
  externalStringId: string | null;
  locale: string | null;
  message: string;
};

export type NormalizedJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "waiting_for_review"
  | "cancelled";

export function mapProviderStatusToNormalized(
  providerKind: ExternalTmsProviderKind,
  providerStatus: string,
): NormalizedJobStatus {
  const status = providerStatus.toLowerCase().trim();

  switch (providerKind) {
    case "crowdin":
      return mapCrowdinStatus(status);
    case "smartling":
      return mapSmartlingStatus(status);
    case "phrase":
      return mapPhraseStatus(status);
    case "lokalise":
      return mapLokaliseStatus(status);
    default:
      return "queued";
  }
}

function mapCrowdinStatus(status: string): NormalizedJobStatus {
  if (["done", "closed", "completed"].includes(status)) return "succeeded";
  if (["in_progress", "in-progress", "inprogress", "in progress", "active"].includes(status))
    return "running";
  if (["todo", "new", "pending", "created", "draft"].includes(status)) return "queued";
  if (["failed", "rejected", "error"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
    ].includes(status)
  )
    return "waiting_for_review";
  if (["cancelled", "canceled", "aborted"].includes(status)) return "cancelled";
  return "queued";
}

function mapSmartlingStatus(status: string): NormalizedJobStatus {
  if (["completed", "published", "done", "closed"].includes(status)) return "succeeded";
  if (
    [
      "in_progress",
      "in-progress",
      "inprogress",
      "active",
      "in_translation",
      "in-translation",
      "in translation",
    ].includes(status)
  )
    return "running";
  if (
    [
      "awaiting_authorization",
      "awaiting-authorization",
      "awaiting authorization",
      "new",
      "pending",
      "created",
      "draft",
    ].includes(status)
  )
    return "queued";
  if (["failed", "rejected", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
      "in_edit",
      "in-edit",
      "in edit",
    ].includes(status)
  )
    return "waiting_for_review";
  return "queued";
}

function mapPhraseStatus(status: string): NormalizedJobStatus {
  if (["completed", "done", "closed", "finished", "delivered", "emailed"].includes(status))
    return "succeeded";
  if (
    [
      "in_progress",
      "in-progress",
      "inprogress",
      "in progress",
      "active",
      "in_translation",
      "in-translation",
      "in translation",
      "accepted",
    ].includes(status)
  )
    return "running";
  if (["new", "pending", "created", "draft", "unclaimed", "open"].includes(status)) return "queued";
  if (["failed", "rejected", "error", "declined"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
      "review",
    ].includes(status)
  )
    return "waiting_for_review";
  if (["cancelled", "canceled", "aborted"].includes(status)) return "cancelled";
  return "queued";
}

function mapLokaliseStatus(status: string): NormalizedJobStatus {
  if (["completed", "done", "closed", "finished"].includes(status)) return "succeeded";
  if (
    [
      "in_progress",
      "in-progress",
      "inprogress",
      "in progress",
      "active",
      "in_translation",
      "in-translation",
      "in translation",
    ].includes(status)
  )
    return "running";
  if (
    [
      "new",
      "pending",
      "created",
      "draft",
      "queued",
      "unassigned",
      "not_started",
      "not-started",
    ].includes(status)
  )
    return "queued";
  if (["failed", "rejected", "error"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
      "reviewing",
    ].includes(status)
  )
    return "waiting_for_review";
  if (["cancelled", "canceled", "aborted", "skipped"].includes(status)) return "cancelled";
  return "queued";
}
