import { openJobStatusValues } from "@/api/routes/project/job.schema";
import { createLogger } from "@/lib/log";
import { schema } from "@/lib/database";
import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatTranslation,
  ProjectFileContent,
  ProjectFileDetailResponse,
} from "@/api/routes/project/project.schema";
import {
  buildSourceStringsPreviewContent,
  normalizeProjectFileContent,
} from "@/lib/projects/files/project-file-content";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import { legacyProviderCatSegmentLimit } from "@/api/routes/project/project.schema";
import { buildCrowdinFileQueueCroql } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import {
  CrowdinApiClient,
  CrowdinApiError,
  type CrowdinProject,
  type CrowdinLanguageTranslation,
  type CrowdinSourceString,
  type CrowdinStringComment,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/phrase/phrase-auth";
import {
  PhraseLiveCatError,
  phraseTmsProvider,
} from "@/lib/providers/adapters/phrase/phrase-provider";
import { PhraseApiClient, PhraseApiError } from "@/lib/providers/adapters/phrase/phrase-api";
import { lokaliseAuth } from "@/lib/providers/adapters/lokalise/lokalise-auth";
import {
  LokaliseLiveCatError,
  lokaliseTmsProvider,
} from "@/lib/providers/adapters/lokalise/lokalise-provider";
import { LokaliseApiClient } from "@/lib/providers/adapters/lokalise/lokalise-api";
import {
  parseSmartlingCredentials,
  SmartlingApiClient,
  SmartlingApiError,
  type SmartlingJobDetails,
} from "@/lib/providers/adapters/smartling/smartling-api";
import {
  SmartlingLiveCatError,
  smartlingTmsProvider,
} from "@/lib/providers/adapters/smartling/smartling-provider";
import { sourceContentType } from "@/lib/file-storage/source-file-metadata";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { normalizeProviderAssigneeCandidates } from "@/lib/providers/jobs/tms-provider-assignee-match";
import {
  API_TOKEN_AUTH_MODE,
  crowdinUsesPerUserAuth,
  OAUTH_AUTH_MODE,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  resolveExternalTmsSecretMaterial,
  type ExternalTmsCredential,
  type ExternalTmsProviderKind,
  type ExternalTmsProviderCredentialSummary,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import {
  tmsProviderGlossaryFetchers,
  tmsProviderFileKeyFetchers,
  tmsProviderJobTaskFetchers,
  tmsProviderProjectFetchers,
  tmsProviderTranslationMemoryFetchers,
} from "@/lib/providers/adapters/tms-provider-registry";
import { extractProviderFileIds } from "@/lib/providers/jobs/job-provider-source-files";
import {
  encodeProviderJobId,
  encodeProviderProjectId,
  parseProviderJobId,
  parseProviderProjectId,
  type EncodedProviderProjectId,
} from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  mapProviderStatusToNormalized,
  type ExternalTmsFileKeyMetadata,
  type ExternalTmsGlossaryMetadata,
  type ExternalTmsJobTaskMetadata,
  type ExternalTmsProjectMetadata,
  type ExternalTmsTranslationMemoryMetadata,
} from "@/lib/providers/jobs/tms-provider-types";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

const logger = createLogger("tms-provider-live");

const LIVE_PROJECT_JOB_FANOUT_CONCURRENCY = 5;
const LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY = 5;
const LIVE_PROJECT_LIST_CACHE_TTL_MS = 60_000;
const openLiveJobStatuses = new Set<string>(openJobStatusValues);
const maxLiveProviderInlineTextBytes = 512 * 1024;
const maxLiveProviderStringPreviewItems = 1_000;
const SAFE_CROWDIN_DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i;
const PROVIDER_CONNECTION_SECRET_ERROR_CODES = new Set([
  "crowdin_oauth_refresh_failed",
  "crowdin_oauth_token_invalid",
  "crowdin_user_connection_required",
  "crowdin_user_connection_auth_mode_mismatch",
  "phrase_oauth_refresh_failed",
  "phrase_oauth_token_invalid",
  "phrase_oauth_token_response_invalid",
  "phrase_user_connection_not_found",
  "phrase_user_connection_required",
  "lokalise_oauth_refresh_failed",
  "lokalise_oauth_token_invalid",
  "lokalise_oauth_token_response_invalid",
  "lokalise_user_connection_not_found",
  "lokalise_user_connection_required",
]);

function sanitizeCrowdinProjectLogo(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) {
    return SAFE_CROWDIN_DATA_IMAGE_PATTERN.test(trimmed) ? trimmed : null;
  }

  return sanitizeExternalUrl(trimmed);
}

function mapCrowdinLiveProjectToMetadata(project: CrowdinProject): ExternalTmsProjectMetadata {
  return {
    externalProjectId: String(project.id),
    name: project.name,
    description: project.description?.trim() || null,
    sourceLocale: project.sourceLanguageId,
    targetLocales: project.targetLanguageIds,
    externalProjectUrl: project.webUrl,
    isActive: !project.isSuspended,
    logoUrl: sanitizeCrowdinProjectLogo(project.logo),
    lastActivityAt: project.lastActivity?.trim() || null,
    metadata: {
      identifier: project.identifier,
    },
  };
}

type ExternalTmsProject = typeof schema.projects.$inferSelect;

export class TmsProviderLiveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TmsProviderLiveError";
  }
}

export type TmsProviderConnection = {
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  validationStatus: string;
  validationMessage: string | null;
};

export type TmsProviderLiveProject = {
  id: string;
  name: string;
  description: string | null;
  translationContext: string | null;
  createdAt: string;
  updatedAt: string;
  source: "external_tms";
  externalProviderKind: ExternalTmsProviderKind;
  externalProjectId: string;
  sourceLocale: string | null;
  targetLocales: string[];
  externalProjectUrl: string | null;
  isActive: boolean;
  logoUrl?: string | null;
  lastActivityAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type TmsProviderLiveJob = {
  id: string;
  projectId: string;
  projectName: string | null;
  createdByUserId: string | null;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: null;
  status: ReturnType<typeof mapProviderStatusToNormalized>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  workflowRunId: string | null;
  lastError: string | null;
  inputPayload: unknown;
  outcomeKind: string | null;
  outcomePayload: unknown;
  reviewCriteria: string | null;
  reviewTargetLocale: string | null;
  syncConnectorKind: string | null;
  syncDirection: string | null;
  assetType: string | null;
  assetOperation: string | null;
  externalProviderKind: ExternalTmsProviderKind;
  externalTaskId: string | null;
  externalStatus: string;
  externalTitle: string;
  externalDueDate: string | null;
  externalTargetLocales: string[];
  externalAssignedUsers: string[];
  externalSyncState: null;
};

export type TmsProviderLiveJobDetail = TmsProviderLiveJob & {
  externalJobId: string;
  externalUrl: string | null;
  externalProviderPayload: Record<string, unknown>;
};

export type TmsProviderLiveJobComment = {
  id: string;
  externalCommentId: string;
  userId: string;
  taskId: string;
  text: string;
  timeSpentSeconds: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TmsProviderLiveFile = {
  origin: "provider";
  sourcePath: string;
  sourceHash: string | null;
  commitSha: null;
  workflowRunId: null;
  uploadedAt: string;
  storedFileId: null;
  metadata: Record<string, unknown>;
  filename: string;
  byteSize: null;
  provider: {
    kind: ExternalTmsProviderKind;
    resourceType: "file" | "key";
    externalProjectId: string;
    externalResourceId: string;
    externalUrl: string | null;
    syncState: string;
    sourceLocale: string | null;
    targetLocales: string[];
    localeReadiness: Record<string, unknown>;
    revision: string | null;
    format: string | null;
    lastSyncedAt: string | null;
  };
  latestJob: null;
};

export type TmsProviderLiveFileDetail = ProjectFileDetailResponse["file"];
export type TmsProviderLiveCatFile = ProjectFileCatQueueFile;

export type TmsProviderLiveGlossary = {
  id: string;
  name: string;
  description: string | null;
  sourceLocale: string;
  targetLocale: string;
  localeCoverage: string[];
  termCount: number | null;
  externalUrl: string | null;
  externalProjectId: string;
  projectName: string | null;
};

export type TmsProviderLiveTranslationMemory = {
  id: string;
  name: string;
  description: string | null;
  sourceLocale: string;
  localeCoverage: string[];
  segmentCount: number | null;
  externalUrl: string | null;
  externalProjectId: string;
  projectName: string | null;
};

type ActiveTmsProviderContext = {
  organizationId: string;
  credential: ExternalTmsCredential;
  summary: ExternalTmsProviderCredentialSummary;
  secretMaterial: string;
  providerKind: ExternalTmsProviderKind;
};

async function buildActiveTmsProviderContext(
  organizationId: string,
  credential: ExternalTmsCredential,
  options?: {
    actorUserId?: string | null;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
  },
): Promise<ActiveTmsProviderContext> {
  const providerKind = credential.providerKind as ExternalTmsProviderKind;
  let secretMaterial: string;
  try {
    secretMaterial = await resolveActiveTmsProviderSecretMaterial({
      organizationId,
      credential,
      actorUserId: options?.actorUserId,
    });
  } catch (error) {
    if (error instanceof Error && PROVIDER_CONNECTION_SECRET_ERROR_CODES.has(error.message)) {
      if (error.message === "crowdin_user_connection_required") {
        throw new TmsProviderLiveError(
          "crowdin_user_connection_required",
          "Connect your Crowdin account before using Crowdin.",
        );
      }
      if (error.message === "crowdin_user_connection_auth_mode_mismatch") {
        throw new TmsProviderLiveError(
          "crowdin_user_connection_auth_mode_mismatch",
          "Reconnect your Crowdin account after the workspace authentication mode changed.",
        );
      }
      if (error.message === "phrase_user_connection_required") {
        throw new TmsProviderLiveError(
          "phrase_user_connection_required",
          "Connect your Phrase account before using Phrase.",
        );
      }
      if (error.message === "lokalise_user_connection_required") {
        throw new TmsProviderLiveError(
          "lokalise_user_connection_required",
          "Connect your Lokalise account before using Lokalise.",
        );
      }

      if (error.message.startsWith("phrase_")) {
        throw new TmsProviderLiveError(
          "phrase_user_auth_invalid",
          "Your Phrase connection is invalid. Reconnect Phrase and try again.",
        );
      }
      if (error.message.startsWith("lokalise_")) {
        throw new TmsProviderLiveError(
          "lokalise_user_auth_invalid",
          "Your Lokalise connection is invalid. Reconnect Lokalise and try again.",
        );
      }

      throw new TmsProviderLiveError(
        "crowdin_user_auth_invalid",
        "Your Crowdin connection is invalid. Reconnect Crowdin and try again.",
      );
    }

    throw error;
  }

  return {
    organizationId,
    credential,
    summary: {
      id: credential.id,
      providerKind,
      displayName: credential.displayName,
      authMode: credential.authMode ?? API_TOKEN_AUTH_MODE,
      region: credential.region,
      baseUrl: credential.baseUrl,
      oauthExpiresAt: credential.oauthExpiresAt?.toISOString() ?? null,
      validationStatus: credential.validationStatus,
      validationMessage: credential.validationMessage,
      lastValidatedAt: credential.lastValidatedAt?.toISOString() ?? null,
      maskedSecretSuffix: credential.maskedSecretSuffix,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    },
    secretMaterial,
    providerKind,
  };
}

async function resolveActiveTmsProviderSecretMaterial(input: {
  organizationId: string;
  credential: ExternalTmsCredential;
  actorUserId?: string | null;
}) {
  if (
    input.credential.providerKind === "crowdin" &&
    crowdinUsesPerUserAuth(input.credential.authMode)
  ) {
    logger.info(
      {
        organizationId: input.organizationId,
        providerCredentialId: input.credential.id,
        actorUserId: input.actorUserId ?? null,
        hasActorUserId: Boolean(input.actorUserId),
      },
      "resolving crowdin oauth user secret material",
    );
  }
  if (input.credential.providerKind === "phrase" && input.credential.authMode === OAUTH_AUTH_MODE) {
    logger.info(
      {
        organizationId: input.organizationId,
        providerCredentialId: input.credential.id,
        actorUserId: input.actorUserId ?? null,
        hasActorUserId: Boolean(input.actorUserId),
      },
      "resolving phrase oauth user secret material",
    );
  }
  if (
    input.credential.providerKind === "lokalise" &&
    input.credential.authMode === OAUTH_AUTH_MODE
  ) {
    logger.info(
      {
        organizationId: input.organizationId,
        providerCredentialId: input.credential.id,
        actorUserId: input.actorUserId ?? null,
        hasActorUserId: Boolean(input.actorUserId),
      },
      "resolving lokalise oauth user secret material",
    );
  }

  const usesCrowdinPerUserAuth =
    input.credential.providerKind === "crowdin" &&
    crowdinUsesPerUserAuth(input.credential.authMode);
  const usesPhraseUserOAuth =
    input.credential.providerKind === "phrase" && input.credential.authMode === OAUTH_AUTH_MODE;
  const usesLokaliseUserOAuth =
    input.credential.providerKind === "lokalise" && input.credential.authMode === OAUTH_AUTH_MODE;

  if (
    (!usesCrowdinPerUserAuth && !usesPhraseUserOAuth && !usesLokaliseUserOAuth) ||
    !input.actorUserId
  ) {
    return resolveExternalTmsSecretMaterial({ credential: input.credential });
  }

  if (usesPhraseUserOAuth) {
    const phraseUserConnection = await getPhraseUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    if (!phraseUserConnection) {
      logger.warn(
        {
          organizationId: input.organizationId,
          providerCredentialId: input.credential.id,
          actorUserId: input.actorUserId,
        },
        "phrase user connection missing while resolving provider secret",
      );
      throw new Error("phrase_user_connection_required");
    }

    logger.info(
      {
        organizationId: input.organizationId,
        providerCredentialId: input.credential.id,
        actorUserId: input.actorUserId,
        connectionId: phraseUserConnection.id,
      },
      "phrase user connection found while resolving provider secret",
    );

    return resolvePhraseUserConnectionSecretMaterial({
      connection: phraseUserConnection,
      baseUrl: input.credential.baseUrl,
    });
  }

  if (usesLokaliseUserOAuth) {
    const lokaliseUserConnection = await lokaliseAuth.getUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    if (!lokaliseUserConnection) {
      logger.warn(
        {
          organizationId: input.organizationId,
          providerCredentialId: input.credential.id,
          actorUserId: input.actorUserId,
        },
        "lokalise user connection missing while resolving provider secret",
      );
      throw new Error("lokalise_user_connection_required");
    }

    logger.info(
      {
        organizationId: input.organizationId,
        providerCredentialId: input.credential.id,
        actorUserId: input.actorUserId,
        connectionId: lokaliseUserConnection.id,
      },
      "lokalise user connection found while resolving provider secret",
    );

    return lokaliseAuth.resolveUserConnectionSecretMaterial({
      connection: lokaliseUserConnection,
    });
  }

  const crowdinUserConnection = await crowdinAuth.getUserConnection({
    organizationId: input.organizationId,
    userId: input.actorUserId,
  });
  if (!crowdinUserConnection) {
    logger.warn(
      {
        organizationId: input.organizationId,
        providerCredentialId: input.credential.id,
        actorUserId: input.actorUserId,
      },
      "crowdin user connection missing while resolving provider secret",
    );
    throw new Error("crowdin_user_connection_required");
  }

  logger.info(
    {
      organizationId: input.organizationId,
      providerCredentialId: input.credential.id,
      actorUserId: input.actorUserId,
      connectionId: crowdinUserConnection.id,
    },
    "crowdin user connection found while resolving provider secret",
  );

  return crowdinAuth.resolveUserConnectionSecretMaterial({
    connection: crowdinUserConnection,
    authMode: input.credential.authMode ?? OAUTH_AUTH_MODE,
  });
}

export async function tryLoadActiveTmsProviderContext(
  organizationId: string,
  options?: {
    actorUserId?: string | null;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
  },
): Promise<ActiveTmsProviderContext | null> {
  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(organizationId);
  if (!credential) {
    return null;
  }

  return buildActiveTmsProviderContext(organizationId, credential, options);
}

async function loadActiveTmsProviderContext(
  organizationId: string,
  options?: { actorUserId?: string | null },
): Promise<ActiveTmsProviderContext> {
  const context = await tryLoadActiveTmsProviderContext(organizationId, options);
  if (!context) {
    throw new TmsProviderLiveError("no_active_tms_provider", "No external TMS is connected.");
  }

  return context;
}

function rethrowProviderFetcherError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === "crowdin_auth_invalid") {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }
    if (error.message === "smartling_auth_invalid") {
      throw new TmsProviderLiveError(
        "smartling_auth_invalid",
        "Smartling credentials are invalid.",
      );
    }
    throw error;
  }

  throw error;
}

function buildLiveProviderProject(input: {
  organizationId: string;
  credentialId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
  externalProjectUrl?: string | null;
  isActive?: boolean;
}): ExternalTmsProject {
  const now = new Date();

  return {
    id: encodeProviderProjectId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
    }),
    organizationId: input.organizationId,
    teamId: null,
    createdByUserId: null,
    updatedByUserId: null,
    name: input.name,
    description: "",
    translationContext: "",
    source: "external_tms",
    externalProviderKind: input.providerKind,
    externalProviderCredentialId: input.credentialId,
    externalProjectId: input.externalProjectId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    externalProjectUrl: input.externalProjectUrl ?? null,
    isActive: input.isActive ?? true,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    providerMetadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function mapLiveProject(
  providerKind: ExternalTmsProviderKind,
  project: ExternalTmsProjectMetadata,
): TmsProviderLiveProject {
  const timestamp = new Date().toISOString();
  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];
  const lastActivityAt = normalizeExternalTimestamp(project.lastActivityAt);
  const updatedAt = lastActivityAt ?? timestamp;

  return {
    id: encodeProviderProjectId({ providerKind, externalProjectId: project.externalProjectId }),
    name: project.name,
    description: project.description?.trim() || null,
    translationContext: null,
    createdAt: timestamp,
    updatedAt,
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: project.externalProjectId,
    sourceLocale,
    targetLocales,
    externalProjectUrl: project.externalProjectUrl ?? null,
    isActive: project.isActive ?? true,
    logoUrl: project.logoUrl ?? null,
    lastActivityAt,
    metadata: project.metadata,
  };
}

function normalizeExternalTimestamp(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return null;
}

function mapLiveJob(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  projectName: string;
  task: ExternalTmsJobTaskMetadata;
}): TmsProviderLiveJob {
  const timestamp = new Date().toISOString();
  const status = mapProviderStatusToNormalized(input.providerKind, input.task.externalStatus);
  const targetLocales = input.task.targetLocales ?? [];
  const assignedUsers = input.task.assignedUsers ?? [];
  const dueDate =
    input.task.dueDate instanceof Date
      ? input.task.dueDate.toISOString()
      : typeof input.task.dueDate === "string"
        ? input.task.dueDate
        : null;

  return {
    id: encodeProviderJobId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      externalJobId: input.task.externalJobId,
    }),
    projectId: encodeProviderProjectId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
    }),
    projectName: input.projectName,
    createdByUserId: null,
    kind: input.task.kind ?? "translation",
    type: null,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt:
      status === "succeeded" || status === "failed"
        ? normalizeExternalTimestamp(input.task.completedAt)
        : null,
    workflowRunId: null,
    lastError: null,
    inputPayload: null,
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: targetLocales[0] ?? null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: input.providerKind,
    externalTaskId: input.task.externalTaskId ?? null,
    externalStatus: input.task.externalStatus,
    externalTitle: input.task.title ?? "Untitled task",
    externalDueDate: dueDate,
    externalTargetLocales: targetLocales,
    externalAssignedUsers: assignedUsers,
    externalSyncState: null,
  };
}

function mapLiveJobDetail(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  projectName: string;
  task: ExternalTmsJobTaskMetadata;
}): TmsProviderLiveJobDetail {
  const job = mapLiveJob({
    providerKind: input.providerKind,
    externalProjectId: input.externalProjectId,
    projectName: input.projectName,
    task: input.task,
  });

  return {
    ...job,
    externalJobId: input.externalJobId,
    externalUrl: input.task.externalUrl ?? null,
    externalProviderPayload:
      input.task.providerPayload && typeof input.task.providerPayload === "object"
        ? input.task.providerPayload
        : {},
  };
}

function mapLiveFile(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  file: ExternalTmsFileKeyMetadata;
  project?: ExternalTmsProjectMetadata;
}): TmsProviderLiveFile {
  const timestamp = new Date().toISOString();
  const sourcePath = input.file.sourcePath;
  const filename = input.file.displayName?.trim() || sourcePath.split("/").filter(Boolean).at(-1);

  return {
    origin: "provider",
    sourcePath,
    sourceHash: input.file.sourceHash ?? null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: timestamp,
    storedFileId: null,
    metadata: input.file.providerPayload ?? {},
    filename: filename || sourcePath,
    byteSize: null,
    provider: {
      kind: input.providerKind,
      resourceType: input.file.resourceType,
      externalProjectId: input.externalProjectId,
      externalResourceId: input.file.externalResourceId,
      externalUrl: input.file.externalUrl ?? null,
      syncState: input.file.syncState ?? "synced",
      sourceLocale: input.file.sourceLocale ?? input.project?.sourceLocale ?? null,
      targetLocales: input.file.targetLocales ?? input.project?.targetLocales ?? [],
      localeReadiness: input.file.localeReadiness ?? {},
      revision: input.file.revision ?? null,
      format: input.file.format ?? null,
      lastSyncedAt: null,
    },
    latestJob: null,
  };
}

function mapPhraseLiveCatError(error: unknown): never {
  if (error instanceof PhraseLiveCatError) {
    throw new TmsProviderLiveError(error.code, error.message);
  }

  throw error;
}

function mapLokaliseLiveCatError(error: unknown): never {
  if (error instanceof LokaliseLiveCatError) {
    throw new TmsProviderLiveError(error.code, error.message);
  }

  throw error;
}

function mapSmartlingLiveCatError(error: unknown): never {
  if (error instanceof SmartlingLiveCatError) {
    throw new TmsProviderLiveError(error.code, error.message);
  }

  throw error;
}

function supportsLiveProviderCat(
  providerKind: ExternalTmsProviderKind,
  file: TmsProviderLiveFile,
): boolean {
  if (!file.provider) {
    return false;
  }

  if (providerKind === "crowdin") {
    return file.provider.resourceType === "file";
  }

  if (providerKind === "phrase" || providerKind === "lokalise" || providerKind === "smartling") {
    return file.provider.resourceType === "file" || file.provider.resourceType === "key";
  }

  return false;
}

function resolveLiveCatFileFromExternalResourceId(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalResourceId: string;
  sourcePath: string;
  resourceType?: "file" | "key";
}): TmsProviderLiveFile {
  return mapLiveFile({
    providerKind: input.providerKind,
    externalProjectId: input.externalProjectId,
    file: {
      resourceType:
        input.resourceType ??
        (input.providerKind === "phrase" || input.providerKind === "lokalise" ? "key" : "file"),
      externalResourceId: input.externalResourceId,
      sourcePath: input.sourcePath,
    },
  });
}

async function resolveLiveCatFile(input: {
  organizationId: string;
  externalProjectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  context: ActiveTmsProviderContext;
}): Promise<TmsProviderLiveFile | null> {
  if (input.externalResourceId) {
    return resolveLiveCatFileFromExternalResourceId({
      providerKind: input.context.providerKind,
      externalProjectId: input.externalProjectId,
      externalResourceId: input.externalResourceId,
      sourcePath: input.sourcePath,
      resourceType: input.resourceType,
    });
  }

  const files = await listTmsProviderLiveFilesForProject(
    input.organizationId,
    input.externalProjectId,
    {
      context: input.context,
      limit: 1000,
    },
  );

  const bySourcePath = files.find((item) => item.sourcePath === input.sourcePath);
  if (bySourcePath) {
    return bySourcePath;
  }

  if (!input.externalResourceId) {
    return null;
  }

  const byResourceId = files.find(
    (item) => item.provider?.externalResourceId === input.externalResourceId,
  );
  if (byResourceId) {
    return byResourceId;
  }

  if (input.context.providerKind === "crowdin") {
    return resolveLiveCatFileFromExternalResourceId({
      providerKind: input.context.providerKind,
      externalProjectId: input.externalProjectId,
      externalResourceId: input.externalResourceId,
      sourcePath: input.sourcePath,
      resourceType: "file",
    });
  }

  if (input.context.providerKind === "lokalise" || input.context.providerKind === "phrase") {
    return resolveLiveCatFileFromExternalResourceId({
      providerKind: input.context.providerKind,
      externalProjectId: input.externalProjectId,
      externalResourceId: input.externalResourceId,
      sourcePath: input.sourcePath,
      resourceType: input.resourceType ?? "key",
    });
  }

  if (input.context.providerKind === "smartling") {
    return resolveLiveCatFileFromExternalResourceId({
      providerKind: input.context.providerKind,
      externalProjectId: input.externalProjectId,
      externalResourceId: input.externalResourceId,
      sourcePath: input.sourcePath,
      resourceType: input.resourceType ?? "file",
    });
  }

  return null;
}

function crowdinSourceTextValue(text: CrowdinSourceString["text"]) {
  return text;
}

function crowdinCatSourceTextValue(text: CrowdinSourceString["text"]): string {
  if (typeof text === "string") {
    return text;
  }

  return JSON.stringify(text);
}

function buildCrowdinSourceStringsPreviewContent(input: {
  strings: CrowdinSourceString[];
  truncated: boolean;
}): ProjectFileContent | null {
  if (input.strings.length === 0) {
    return null;
  }

  const entries = input.strings.map((sourceString) => ({
    id: sourceString.id,
    key: sourceString.identifier,
    text:
      typeof sourceString.text === "string"
        ? sourceString.text
        : JSON.stringify(crowdinSourceTextValue(sourceString.text)),
    type: sourceString.type,
    context: sourceString.context,
  }));

  return buildSourceStringsPreviewContent({
    entries,
    truncated: input.truncated,
    note: "Raw source file download was unavailable; this preview is generated from Crowdin source string metadata.",
  });
}

async function downloadCrowdinSourceStringPreview(input: {
  client: CrowdinApiClient;
  projectId: number;
  fileId: number;
}): Promise<{
  byteSize: number | null;
  content: ProjectFileContent | null;
  contentType: string | null;
} | null> {
  const strings = await input.client.listSourceStrings(input.projectId, {
    fileId: input.fileId,
    maxItems: maxLiveProviderStringPreviewItems + 1,
  });
  const previewContent = buildCrowdinSourceStringsPreviewContent({
    strings: strings.slice(0, maxLiveProviderStringPreviewItems),
    truncated: strings.length > maxLiveProviderStringPreviewItems,
  });
  if (!previewContent) {
    return null;
  }

  const serialized = JSON.stringify(previewContent);
  const byteSize = new TextEncoder().encode(serialized).byteLength;
  return {
    byteSize,
    content: byteSize <= maxLiveProviderInlineTextBytes ? previewContent : null,
    contentType: "application/json",
  };
}

function sortTranslationsByNewest(
  translations: CrowdinLanguageTranslation[],
): CrowdinLanguageTranslation[] {
  return translations.toSorted((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

function crowdinCatCommentsForTargetLocale(
  comments: CrowdinStringComment[],
  targetLocale: string,
): CrowdinStringComment[] {
  return comments.filter((comment) => !comment.languageId || comment.languageId === targetLocale);
}

function preferredLanguageTranslation(
  translations: CrowdinLanguageTranslation[],
  approvedTranslationIds: ReadonlySet<number>,
): CrowdinLanguageTranslation | null {
  const withText = translations.filter((translation) => translation.text != null);
  const approved = sortTranslationsByNewest(
    withText.filter(
      (translation) =>
        translation.translationId != null && approvedTranslationIds.has(translation.translationId),
    ),
  );
  if (approved.length > 0) {
    return approved[0];
  }

  return sortTranslationsByNewest(withText)[0] ?? null;
}

async function buildCrowdinLiveCatFile(input: {
  context: ActiveTmsProviderContext;
  file: TmsProviderLiveFile;
  targetLocale: string;
  canEditTranslations: boolean;
  pagination?: ProjectFileCatPaginationInput;
}): Promise<TmsProviderLiveCatFile> {
  const projectId = Number(input.file.provider?.externalProjectId);
  const fileId = Number(input.file.provider?.externalResourceId);
  if (Number.isNaN(projectId) || Number.isNaN(fileId)) {
    throw new TmsProviderLiveError(
      "invalid_crowdin_project_or_file_id",
      "Crowdin project or file identifier is invalid.",
    );
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  try {
    const paginationInput = input.pagination ?? {
      offset: 0,
      limit: legacyProviderCatSegmentLimit,
      search: undefined,
      queueFilter: "all",
      paginated: false,
    };

    let visibleStrings: CrowdinSourceString[] = [];
    let truncated = false;
    let pagination: ReturnType<typeof buildCatFilePagination> | undefined;

    if (!paginationInput.paginated) {
      const strings = await client.listSourceStrings(projectId, {
        fileId,
        maxItems: legacyProviderCatSegmentLimit + 1,
      });
      truncated = strings.length > legacyProviderCatSegmentLimit;
      visibleStrings = truncated ? strings.slice(0, legacyProviderCatSegmentLimit) : strings;
    } else {
      const croql =
        paginationInput.search?.trim() ||
        (paginationInput.queueFilter && paginationInput.queueFilter !== "all")
          ? buildCrowdinFileQueueCroql({
              fileId,
              targetLocale: input.targetLocale,
              queueFilter: paginationInput.queueFilter,
              search: paginationInput.search,
            })
          : undefined;
      const page = await client.listSourceStringsPage(projectId, {
        fileId: croql ? undefined : fileId,
        croql,
        offset: paginationInput.offset,
        limit: paginationInput.limit,
      });

      visibleStrings = page.strings;

      const totalCount = page.hasMore
        ? paginationInput.offset + visibleStrings.length + 1
        : paginationInput.offset + visibleStrings.length;

      pagination = buildCatFilePagination({
        offset: paginationInput.offset,
        limit: paginationInput.limit,
        returnedCount: visibleStrings.length,
        totalCount,
        hasMore: page.hasMore,
      });
      truncated = pagination.hasMore;
    }

    return {
      sourcePath: input.file.sourcePath,
      filename: input.file.filename,
      provider: input.file.provider,
      targetLocale: input.targetLocale,
      canEditTranslations: input.canEditTranslations,
      truncated,
      pagination,
      segments: visibleStrings.map((sourceString) => ({
        externalStringId: String(sourceString.id),
        key: sourceString.identifier,
        sourceText: crowdinCatSourceTextValue(sourceString.text),
        context: sourceString.context,
        type: sourceString.type ?? null,
      })),
    };
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }

    throw error;
  }
}

async function buildCrowdinLiveCatSegmentTarget(input: {
  context: ActiveTmsProviderContext;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatTranslation | null> {
  const projectId = Number(input.file.provider?.externalProjectId);
  const stringId = Number(input.externalStringId);
  if (Number.isNaN(projectId) || Number.isNaN(stringId)) {
    throw new TmsProviderLiveError(
      "invalid_crowdin_project_or_file_id",
      "Crowdin project or file identifier is invalid.",
    );
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  try {
    const [translations, approvals] = await Promise.all([
      client.listLanguageTranslations(projectId, input.targetLocale, {
        stringIds: [stringId],
      }),
      client.listTranslationApprovals(projectId, input.targetLocale, { stringId }),
    ]);

    const approvedTranslationIds = new Set(approvals.map((approval) => approval.translationId));
    const target = preferredLanguageTranslation(translations, approvedTranslationIds);

    return target?.text
      ? {
          text: target.text,
          externalTranslationId: target.translationId != null ? String(target.translationId) : null,
          isApproved:
            target.translationId != null && approvedTranslationIds.has(target.translationId),
        }
      : null;
  } catch (error) {
    if (error instanceof CrowdinApiError) {
      if (error.status === 401) {
        throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
      }
      if (error.status === 404) {
        return null;
      }
    }

    throw error;
  }
}

async function saveCrowdinLiveCatTranslation(input: {
  context: ActiveTmsProviderContext;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatTranslation> {
  const projectId = Number(input.file.provider?.externalProjectId);
  const stringId = Number(input.externalStringId);
  if (Number.isNaN(projectId) || Number.isNaN(stringId)) {
    throw new TmsProviderLiveError(
      "invalid_crowdin_project_or_string_id",
      "Crowdin project or string identifier is invalid.",
    );
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  try {
    const fileId = Number(input.file.provider?.externalResourceId);
    const [translations, approvals] = await Promise.all([
      client.listLanguageTranslations(projectId, input.targetLocale, {
        stringIds: [stringId],
      }),
      Number.isNaN(fileId)
        ? client.listTranslationApprovals(projectId, input.targetLocale, { stringId })
        : client.listTranslationApprovals(projectId, input.targetLocale, { fileId }),
    ]);
    const approvedTranslationIds = new Set(approvals.map((approval) => approval.translationId));
    const existing = preferredLanguageTranslation(translations, approvedTranslationIds);
    const existingTranslationId = existing?.translationId;
    const saved =
      existingTranslationId != null && approvedTranslationIds.has(existingTranslationId)
        ? await client.replaceApprovedTranslation(projectId, {
            translationId: existingTranslationId,
            stringId,
            languageId: input.targetLocale,
            text: input.text,
          })
        : existingTranslationId != null
          ? await client.updateTranslation(projectId, existingTranslationId, input.text)
          : await client.addTranslation(projectId, {
              stringId,
              languageId: input.targetLocale,
              text: input.text,
            });
    const translationId = saved.id ?? existingTranslationId ?? null;

    return {
      text: saved.text,
      externalTranslationId: translationId != null ? String(translationId) : null,
      isApproved: false,
    };
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }

    throw error;
  }
}

async function buildCrowdinLiveCatSegmentComments(input: {
  context: ActiveTmsProviderContext;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatComment[]> {
  const projectId = Number(input.file.provider?.externalProjectId);
  const stringId = Number(input.externalStringId);
  if (Number.isNaN(projectId) || Number.isNaN(stringId)) {
    throw new TmsProviderLiveError(
      "invalid_crowdin_project_or_string_id",
      "Crowdin project or string identifier is invalid.",
    );
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  try {
    const comments = await client.listStringComments(projectId, {
      stringId,
      targetLanguageId: input.targetLocale,
    });

    const visibleComments = crowdinCatCommentsForTargetLocale(comments, input.targetLocale).filter(
      (comment) => comment.type !== "issue" || comment.issueStatus === "unresolved",
    );

    return visibleComments
      .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((comment) => mapCrowdinStringComment(comment));
  } catch (error) {
    if (error instanceof CrowdinApiError) {
      if (error.status === 401) {
        throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
      }
      if (error.status === 404) {
        return [];
      }
    }

    throw error;
  }
}

function mapCrowdinStringComment(comment: CrowdinStringComment): ProjectFileCatComment {
  return {
    externalCommentId: String(comment.id),
    type: comment.type === "issue" ? "issue" : "comment",
    status: comment.issueStatus ?? null,
    text: comment.text,
    createdAt: comment.createdAt,
    locale: comment.languageId || null,
    author: comment.user?.fullName ?? comment.user?.username ?? null,
  };
}

async function saveCrowdinLiveCatComment(input: {
  context: ActiveTmsProviderContext;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
  type?: "comment" | "issue";
  issueType?: string;
}): Promise<ProjectFileCatComment> {
  const projectId = Number(input.file.provider?.externalProjectId);
  const stringId = Number(input.externalStringId);
  if (Number.isNaN(projectId) || Number.isNaN(stringId)) {
    throw new TmsProviderLiveError(
      "invalid_crowdin_project_or_string_id",
      "Crowdin project or string identifier is invalid.",
    );
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  const commentType = input.type ?? "comment";

  try {
    const created = await client.addStringComment(projectId, {
      text: input.text,
      stringId,
      targetLanguageId: input.targetLocale,
      type: commentType,
      ...(commentType === "issue" ? { issueType: input.issueType ?? "general_question" } : {}),
    });

    return mapCrowdinStringComment(created);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }

    throw error;
  }
}

async function resolveCrowdinLiveCatComment(input: {
  context: ActiveTmsProviderContext;
  file: TmsProviderLiveFile;
  externalCommentId: string;
}): Promise<ProjectFileCatComment> {
  const projectId = Number(input.file.provider?.externalProjectId);
  const commentId = Number(input.externalCommentId);
  if (Number.isNaN(projectId) || Number.isNaN(commentId)) {
    throw new TmsProviderLiveError(
      "invalid_crowdin_project_or_comment_id",
      "Crowdin project or comment identifier is invalid.",
    );
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  try {
    const updated = await client.editStringComment(projectId, commentId, [
      { op: "replace", path: "/issueStatus", value: "resolved" },
    ]);

    return mapCrowdinStringComment(updated);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }

    throw error;
  }
}

async function downloadLiveProviderFileContent(input: {
  context: ActiveTmsProviderContext;
  externalProjectId: string;
  externalResourceId: string;
  sourcePath: string;
}): Promise<{
  byteSize: number | null;
  content: ProjectFileContent | null;
  contentType: string | null;
}> {
  if (input.context.providerKind === "smartling") {
    if (!inferSupportedFileTranslationFileFormat(input.sourcePath)) {
      return { byteSize: null, content: null, contentType: null };
    }

    const credentials = parseSmartlingCredentials(input.context.secretMaterial);
    const client = new SmartlingApiClient({
      credentials,
      authBaseUrl: input.context.credential.baseUrl ?? undefined,
    });

    try {
      const bytes = await client.downloadSourceFile(
        input.externalProjectId,
        input.externalResourceId,
      );
      const byteSize = bytes.byteLength;

      return {
        byteSize,
        content:
          byteSize <= maxLiveProviderInlineTextBytes
            ? { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes) }
            : null,
        contentType: sourceContentType(input.sourcePath),
      };
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new TmsProviderLiveError(
          "smartling_auth_invalid",
          "Smartling credentials are invalid.",
        );
      }

      logger.warn("tms_provider_live_file_content_failed", {
        organizationId: input.context.organizationId,
        providerKind: input.context.providerKind,
        externalProjectId: input.externalProjectId,
        externalResourceId: input.externalResourceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { byteSize: null, content: null, contentType: null };
    }
  }

  if (input.context.providerKind !== "crowdin") {
    return { byteSize: null, content: null, contentType: null };
  }

  if (!inferSupportedFileTranslationFileFormat(input.sourcePath)) {
    return { byteSize: null, content: null, contentType: null };
  }

  const projectId = Number(input.externalProjectId);
  const fileId = Number(input.externalResourceId);
  if (Number.isNaN(projectId) || Number.isNaN(fileId)) {
    return { byteSize: null, content: null, contentType: null };
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  try {
    const downloadLink = await client.downloadFile(projectId, fileId);
    const bytes = await client.downloadUrl(downloadLink.url);
    const byteSize = bytes.byteLength;

    return {
      byteSize,
      content:
        byteSize <= maxLiveProviderInlineTextBytes
          ? { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes) }
          : null,
      contentType: sourceContentType(input.sourcePath),
    };
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }

    try {
      const preview = await downloadCrowdinSourceStringPreview({ client, projectId, fileId });
      if (preview) {
        return preview;
      }
    } catch (previewError) {
      if (previewError instanceof CrowdinApiError && previewError.status === 401) {
        throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
      }

      logger.warn("tms_provider_live_file_content_failed", {
        organizationId: input.context.organizationId,
        providerKind: input.context.providerKind,
        externalProjectId: input.externalProjectId,
        externalResourceId: input.externalResourceId,
        downloadError: error instanceof Error ? error.message : String(error),
        previewError: previewError instanceof Error ? previewError.message : String(previewError),
      });
      return { byteSize: null, content: null, contentType: null };
    }

    logger.warn("tms_provider_live_file_content_failed", {
      organizationId: input.context.organizationId,
      providerKind: input.context.providerKind,
      externalProjectId: input.externalProjectId,
      externalResourceId: input.externalResourceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { byteSize: null, content: null, contentType: null };
  }
}

async function fetchLiveProjects(context: ActiveTmsProviderContext) {
  const fetcher = tmsProviderProjectFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live project fetch is not available for ${context.providerKind}.`,
    );
  }

  try {
    return await fetcher({
      organizationId: context.organizationId,
      providerKind: context.providerKind,
      credential: context.credential,
      secretMaterial: context.secretMaterial,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }
}

type LiveProjectListCacheEntry = {
  expiresAt: number;
  projects: ExternalTmsProjectMetadata[];
};

const liveProjectListCache = new Map<string, LiveProjectListCacheEntry>();

function liveProjectListCacheKey(
  context: ActiveTmsProviderContext,
  options?: { actorUserId?: string | null },
) {
  return `${context.organizationId}:${context.credential.id}:${context.providerKind}:${options?.actorUserId ?? ""}`;
}

async function fetchLiveProjectsCached(
  context: ActiveTmsProviderContext,
  options?: { actorUserId?: string | null },
): Promise<ExternalTmsProjectMetadata[]> {
  const cacheKey = liveProjectListCacheKey(context, options);
  const cached = liveProjectListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.projects;
  }

  const projects = await fetchLiveProjects(context);
  liveProjectListCache.set(cacheKey, {
    projects,
    expiresAt: Date.now() + LIVE_PROJECT_LIST_CACHE_TTL_MS,
  });
  return projects;
}

function shouldUseCrowdinUserTasksForMine(
  context: ActiveTmsProviderContext,
  mine?: boolean,
): boolean {
  return (
    Boolean(mine) &&
    context.providerKind === "crowdin" &&
    crowdinUsesPerUserAuth(context.credential.authMode)
  );
}

function readCrowdinTaskProjectId(task: ExternalTmsJobTaskMetadata): string | null {
  const projectId = task.providerPayload?.projectId;
  if (typeof projectId === "number" && Number.isFinite(projectId)) {
    return String(projectId);
  }
  if (typeof projectId === "string" && projectId.trim()) {
    return projectId.trim();
  }
  return null;
}

async function listCrowdinUserAssignedLiveJobs(input: {
  context: ActiveTmsProviderContext;
  projects: ExternalTmsProjectMetadata[];
  externalProjectId?: string;
}): Promise<TmsProviderLiveJob[]> {
  const projectNameById = new Map(
    input.projects.map((project) => [project.externalProjectId, project.name]),
  );

  let tasks;
  try {
    tasks = await crowdinTmsProvider.fetchUserJobTasks({
      credential: input.context.credential,
      secretMaterial: input.context.secretMaterial,
      externalProjectId: input.externalProjectId,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }

  return tasks.flatMap((task) => {
    const taskProjectId = readCrowdinTaskProjectId(task) ?? input.externalProjectId ?? null;
    if (!taskProjectId) {
      return [];
    }

    const projectName = projectNameById.get(taskProjectId) ?? "Unknown project";
    return [
      mapLiveJob({
        providerKind: input.context.providerKind,
        externalProjectId: taskProjectId,
        projectName,
        task,
      }),
    ];
  });
}

export async function getTmsProviderConnection(
  organizationId: string,
): Promise<TmsProviderConnection | null> {
  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(organizationId);
  if (!credential) {
    return null;
  }

  return {
    providerKind: credential.providerKind as ExternalTmsProviderKind,
    displayName: credential.displayName,
    validationStatus: credential.validationStatus,
    validationMessage: credential.validationMessage,
  };
}

async function loadActiveLiveProjects(
  organizationId: string,
  options?: { actorUserId?: string | null },
): Promise<{ context: ActiveTmsProviderContext; activeProjects: ExternalTmsProjectMetadata[] }> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const projects = await fetchLiveProjectsCached(context, options);
  const activeProjects = projects.filter((project) => project.isActive !== false);
  return { context, activeProjects };
}

export async function listTmsProviderLiveProjects(
  organizationId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveProject[]> {
  const { context, activeProjects } = await loadActiveLiveProjects(organizationId, options);
  return activeProjects.map((project) => mapLiveProject(context.providerKind, project));
}

async function resolveLiveProjectMetadata(
  context: ActiveTmsProviderContext,
  externalProjectId: string,
  options?: { includeBranches?: boolean },
): Promise<ExternalTmsProjectMetadata | null> {
  if (context.providerKind === "crowdin") {
    const crowdinProjectId = Number(externalProjectId);
    if (!Number.isFinite(crowdinProjectId) || crowdinProjectId <= 0) {
      return null;
    }

    if (options?.includeBranches) {
      try {
        return await crowdinTmsProvider.fetchProjectDetailMetadata({
          projectId: crowdinProjectId,
          token: context.secretMaterial,
          baseUrl: context.credential.baseUrl ?? undefined,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "crowdin_auth_invalid") {
          throw new TmsProviderLiveError(
            "crowdin_auth_invalid",
            "Crowdin credentials are invalid.",
          );
        }
        throw error;
      }
    }

    const client = new CrowdinApiClient({
      token: context.secretMaterial,
      baseUrl: context.credential.baseUrl ?? undefined,
    });

    try {
      const project = await client.getProject(crowdinProjectId);
      return mapCrowdinLiveProjectToMetadata(project);
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 404) {
        return null;
      }
      rethrowProviderFetcherError(error);
    }
  }

  const projects = await fetchLiveProjectsCached(context);
  const activeProject = projects.find(
    (project) => project.externalProjectId === externalProjectId && project.isActive !== false,
  );
  if (activeProject) {
    return activeProject;
  }

  return projects.find((project) => project.externalProjectId === externalProjectId) ?? null;
}

export async function getTmsProviderLiveProject(
  organizationId: string,
  externalProjectId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveProject | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const projectMetadata = await resolveLiveProjectMetadata(context, externalProjectId, {
    includeBranches: true,
  });
  if (!projectMetadata) {
    return null;
  }

  return mapLiveProject(context.providerKind, projectMetadata);
}

function countOpenLiveJobs(jobs: TmsProviderLiveJob[]): number {
  return jobs.filter((job) => openLiveJobStatuses.has(job.status)).length;
}

export async function countTmsProviderLiveOpenJobsForProject(
  organizationId: string,
  externalProjectId: string,
  options?: { actorUserId?: string | null },
): Promise<number> {
  const jobs = await listTmsProviderLiveJobsForProject(organizationId, externalProjectId, {
    actorUserId: options?.actorUserId,
    enrichResources: false,
  });
  return countOpenLiveJobs(jobs);
}

export async function listTmsProviderLiveJobsForProject(
  organizationId: string,
  externalProjectId: string,
  options?: {
    mine?: boolean;
    assignee?: string | null;
    assigneeCandidates?: string[];
    context?: ActiveTmsProviderContext;
    projects?: ExternalTmsProjectMetadata[];
    actorUserId?: string | null;
    enrichResources?: boolean;
  },
): Promise<TmsProviderLiveJob[]> {
  const context =
    options?.context ??
    (await loadActiveTmsProviderContext(organizationId, { actorUserId: options?.actorUserId }));
  const fetcher = tmsProviderJobTaskFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live job fetch is not available for ${context.providerKind}.`,
    );
  }

  const projectMetadata =
    options?.projects?.find((project) => project.externalProjectId === externalProjectId) ??
    (await resolveLiveProjectMetadata(context, externalProjectId));
  if (!projectMetadata) {
    return [];
  }

  if (shouldUseCrowdinUserTasksForMine(context, options?.mine)) {
    const projects = options?.projects ?? (await fetchLiveProjectsCached(context, options));
    return listCrowdinUserAssignedLiveJobs({
      context,
      projects,
      externalProjectId,
    });
  }

  const liveProject = buildLiveProviderProject({
    organizationId: context.organizationId,
    credentialId: context.credential.id,
    providerKind: context.providerKind,
    externalProjectId: projectMetadata.externalProjectId,
    name: projectMetadata.name,
    sourceLocale: projectMetadata.sourceLocale ?? "en",
    targetLocales: projectMetadata.targetLocales ?? [],
    externalProjectUrl: projectMetadata.externalProjectUrl,
    isActive: projectMetadata.isActive,
  });

  let tasks;
  try {
    tasks = await fetcher({
      organizationId: context.organizationId,
      projectId: liveProject.id,
      providerKind: context.providerKind,
      externalProjectId,
      credential: context.credential,
      project: liveProject,
      secretMaterial: context.secretMaterial,
      enrichResources: options?.enrichResources ?? false,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }

  const assigneeCandidates = [
    ...(options?.assigneeCandidates ?? []),
    ...(options?.assignee ? [options.assignee] : []),
  ];
  const normalizedCandidates = normalizeProviderAssigneeCandidates(assigneeCandidates);
  const filteredTasks = options?.mine
    ? normalizedCandidates.length > 0
      ? tasks.filter((task) =>
          (task.assignedUsers ?? []).some((user) => {
            const normalizedAssignedUser = user.trim().toLowerCase();
            return (
              Boolean(normalizedAssignedUser) &&
              normalizedCandidates.includes(normalizedAssignedUser)
            );
          }),
        )
      : []
    : tasks;

  return filteredTasks.map((task) =>
    mapLiveJob({
      providerKind: context.providerKind,
      externalProjectId,
      projectName: projectMetadata.name,
      task,
    }),
  );
}

export type TmsProviderLiveProjectBranch = {
  name: string;
  title: string | null;
};

export async function listTmsProviderLiveProjectBranches(
  organizationId: string,
  externalProjectId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveProjectBranch[]> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });

  if (context.providerKind === "crowdin") {
    const projectId = Number(externalProjectId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return [];
    }

    const client = new CrowdinApiClient({
      token: context.secretMaterial,
      baseUrl: context.credential.baseUrl ?? undefined,
    });

    try {
      const branches = await client.listBranches(projectId);
      return branches.map((branch) => ({
        name: branch.name,
        title: branch.title ?? null,
      }));
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 401) {
        throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
      }
      throw error;
    }
  }

  if (context.providerKind === "phrase") {
    if (!externalProjectId.trim()) {
      return [];
    }

    const client = new PhraseApiClient({
      token: context.secretMaterial,
      region: context.credential.region,
      baseUrl: context.credential.baseUrl,
    });

    try {
      const branches = await client.listBranches(externalProjectId);
      return branches.map((branch) => ({
        name: branch.name,
        title: null,
      }));
    } catch (error) {
      if (error instanceof PhraseApiError && error.status === 401) {
        throw new TmsProviderLiveError("phrase_auth_invalid", "Phrase credentials are invalid.");
      }
      throw error;
    }
  }

  return [];
}

export async function listTmsProviderLiveFilesForProject(
  organizationId: string,
  externalProjectId: string,
  options?: {
    limit?: number;
    branch?: string | null;
    context?: ActiveTmsProviderContext;
    projects?: ExternalTmsProjectMetadata[];
    actorUserId?: string | null;
  },
): Promise<TmsProviderLiveFile[]> {
  const context =
    options?.context ??
    (await loadActiveTmsProviderContext(organizationId, { actorUserId: options?.actorUserId }));

  const projectMetadata =
    options?.projects?.find((project) => project.externalProjectId === externalProjectId) ??
    (await resolveLiveProjectMetadata(context, externalProjectId));
  if (!projectMetadata) {
    return [];
  }

  const fetcher = tmsProviderFileKeyFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live file fetch is not available for ${context.providerKind}.`,
    );
  }

  const liveProviderProject = buildLiveProviderProject({
    organizationId: context.organizationId,
    credentialId: context.credential.id,
    providerKind: context.providerKind,
    externalProjectId: projectMetadata.externalProjectId,
    name: projectMetadata.name,
    sourceLocale: projectMetadata.sourceLocale ?? "en",
    targetLocales: projectMetadata.targetLocales ?? [],
    externalProjectUrl: projectMetadata.externalProjectUrl,
    isActive: projectMetadata.isActive,
  });

  let files;
  try {
    files = await fetcher({
      organizationId: context.organizationId,
      projectId: liveProviderProject.id,
      providerKind: context.providerKind,
      externalProjectId,
      credential: context.credential,
      project: liveProviderProject,
      secretMaterial: context.secretMaterial,
      branch: options?.branch ?? null,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }

  return files.slice(0, options?.limit ?? 500).map((file) =>
    mapLiveFile({
      providerKind: context.providerKind,
      externalProjectId,
      file,
      project: projectMetadata,
    }),
  );
}

async function buildTmsProviderLiveFileDetail(
  context: ActiveTmsProviderContext,
  file: TmsProviderLiveFile,
): Promise<TmsProviderLiveFileDetail | null> {
  if (!file.provider) {
    return null;
  }

  const downloaded =
    file.provider.resourceType === "file"
      ? await downloadLiveProviderFileContent({
          context,
          externalProjectId: file.provider.externalProjectId,
          externalResourceId: file.provider.externalResourceId,
          sourcePath: file.sourcePath,
        })
      : { byteSize: null, content: null, contentType: null };

  return {
    sourcePath: file.sourcePath,
    filename: file.filename,
    provider: file.provider,
    versions: [
      {
        id: `provider-live:${file.provider.kind}:${file.provider.externalProjectId}:${file.provider.externalResourceId}`,
        origin: "provider",
        sourcePath: file.sourcePath,
        sourceHash: file.sourceHash,
        revision: file.provider.revision,
        commitSha: null,
        workflowRunId: null,
        uploadedAt: file.uploadedAt,
        storedFileId: null,
        filename: file.filename,
        contentType: downloaded.contentType,
        byteSize: downloaded.byteSize,
        sha256: null,
        metadata: file.metadata,
        content: normalizeProjectFileContent(downloaded.content),
      },
    ],
    jobsByLocale: [],
    providerJobsByLocale: [],
  };
}

export async function getTmsProviderLiveFileDetail(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  options?: {
    actorUserId?: string | null;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
  },
): Promise<TmsProviderLiveFileDetail | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: options?.externalResourceId,
    resourceType: options?.resourceType,
    context,
  });
  if (!file) {
    return null;
  }

  return buildTmsProviderLiveFileDetail(context, file);
}

export async function getTmsProviderLiveCatFile(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  targetLocale: string,
  options?: {
    actorUserId?: string | null;
    canEditTranslations?: boolean;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
    pagination?: ProjectFileCatPaginationInput;
  },
): Promise<TmsProviderLiveCatFile | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: options?.externalResourceId,
    resourceType: options?.resourceType,
    context,
  });
  if (!file) {
    return null;
  }

  if (!supportsLiveProviderCat(context.providerKind, file)) {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "CAT editing is not available for this provider file yet.",
    );
  }

  if (context.providerKind === "phrase") {
    try {
      return await phraseTmsProvider.buildLiveCatFile({
        secretMaterial: context.secretMaterial,
        region: context.credential.region,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        canEditTranslations: options?.canEditTranslations ?? false,
        pagination: options?.pagination,
      });
    } catch (error) {
      return mapPhraseLiveCatError(error);
    }
  }

  if (context.providerKind === "lokalise") {
    try {
      return await lokaliseTmsProvider.buildLiveCatFile({
        secretMaterial: context.secretMaterial,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        canEditTranslations: options?.canEditTranslations ?? false,
        pagination: options?.pagination,
      });
    } catch (error) {
      mapLokaliseLiveCatError(error);
    }
  }

  if (context.providerKind === "smartling") {
    try {
      return await smartlingTmsProvider.buildLiveCatFile({
        secretMaterial: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        canEditTranslations: options?.canEditTranslations ?? false,
        pagination: options?.pagination,
      });
    } catch (error) {
      mapSmartlingLiveCatError(error);
    }
  }

  return buildCrowdinLiveCatFile({
    context,
    file,
    targetLocale,
    canEditTranslations: options?.canEditTranslations ?? false,
    pagination: options?.pagination,
  });
}

export async function getTmsProviderLiveCatSegmentTarget(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  targetLocale: string,
  externalStringId: string,
  options?: {
    actorUserId?: string | null;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
  },
): Promise<ProjectFileCatTranslation | null | "not_found"> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: options?.externalResourceId,
    resourceType: options?.resourceType,
    context,
  });
  if (!file) {
    return "not_found";
  }

  if (!supportsLiveProviderCat(context.providerKind, file)) {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "CAT editing is not available for this provider file yet.",
    );
  }

  if (context.providerKind === "phrase") {
    try {
      return await phraseTmsProvider.getLiveCatSegmentTarget({
        secretMaterial: context.secretMaterial,
        region: context.credential.region,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        externalStringId,
      });
    } catch (error) {
      mapPhraseLiveCatError(error);
    }
  }

  if (context.providerKind === "lokalise") {
    try {
      return await lokaliseTmsProvider.getLiveCatSegmentTarget({
        secretMaterial: context.secretMaterial,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        externalStringId,
      });
    } catch (error) {
      mapLokaliseLiveCatError(error);
    }
  }

  if (context.providerKind === "smartling") {
    try {
      return await smartlingTmsProvider.getLiveCatSegmentTarget({
        secretMaterial: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        externalStringId,
      });
    } catch (error) {
      mapSmartlingLiveCatError(error);
    }
  }

  return buildCrowdinLiveCatSegmentTarget({
    context,
    file,
    targetLocale,
    externalStringId,
  });
}

export async function getTmsProviderLiveCatSegmentComments(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  targetLocale: string,
  externalStringId: string,
  options?: {
    actorUserId?: string | null;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
  },
): Promise<ProjectFileCatComment[]> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: options?.externalResourceId,
    resourceType: options?.resourceType,
    context,
  });
  if (!file) {
    return [];
  }

  if (!supportsLiveProviderCat(context.providerKind, file)) {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "CAT comments are not available for this provider file yet.",
    );
  }

  if (context.providerKind === "phrase") {
    try {
      return await phraseTmsProvider.getLiveCatSegmentComments({
        secretMaterial: context.secretMaterial,
        region: context.credential.region,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        externalStringId,
      });
    } catch (error) {
      mapPhraseLiveCatError(error);
    }
  }

  if (context.providerKind === "lokalise") {
    try {
      return await lokaliseTmsProvider.getLiveCatSegmentComments({
        secretMaterial: context.secretMaterial,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        externalStringId,
      });
    } catch (error) {
      mapLokaliseLiveCatError(error);
    }
  }

  if (context.providerKind === "smartling") {
    try {
      return await smartlingTmsProvider.getLiveCatSegmentComments({
        secretMaterial: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale,
        externalStringId,
      });
    } catch (error) {
      mapSmartlingLiveCatError(error);
    }
  }

  return buildCrowdinLiveCatSegmentComments({
    context,
    file,
    targetLocale,
    externalStringId,
  });
}

export async function saveTmsProviderLiveCatTranslation(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  input: {
    targetLocale: string;
    externalStringId: string;
    text: string;
    externalResourceId?: string | null;
  },
  options?: { actorUserId?: string | null },
): Promise<ProjectFileCatTranslation | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: input.externalResourceId,
    context,
  });
  if (!file) {
    return null;
  }

  if (!supportsLiveProviderCat(context.providerKind, file)) {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "CAT editing is not available for this provider file yet.",
    );
  }

  if (context.providerKind === "phrase") {
    try {
      return await phraseTmsProvider.saveLiveCatTranslation({
        secretMaterial: context.secretMaterial,
        region: context.credential.region,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
      });
    } catch (error) {
      mapPhraseLiveCatError(error);
    }
  }

  if (context.providerKind === "lokalise") {
    try {
      return await lokaliseTmsProvider.saveLiveCatTranslation({
        secretMaterial: context.secretMaterial,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
      });
    } catch (error) {
      mapLokaliseLiveCatError(error);
    }
  }

  if (context.providerKind === "smartling") {
    try {
      return await smartlingTmsProvider.saveLiveCatTranslation({
        secretMaterial: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
      });
    } catch (error) {
      mapSmartlingLiveCatError(error);
    }
  }

  return saveCrowdinLiveCatTranslation({
    context,
    file,
    targetLocale: input.targetLocale,
    externalStringId: input.externalStringId,
    text: input.text,
  });
}

export async function saveTmsProviderLiveCatComment(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  input: {
    targetLocale: string;
    externalStringId: string;
    text: string;
    externalResourceId?: string | null;
    type?: "comment" | "issue";
    issueType?: string;
  },
  options?: { actorUserId?: string | null },
): Promise<ProjectFileCatComment | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: input.externalResourceId,
    context,
  });
  if (!file) {
    return null;
  }

  if (!supportsLiveProviderCat(context.providerKind, file)) {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "CAT comments are not available for this provider file yet.",
    );
  }

  if (context.providerKind === "phrase" || context.providerKind === "lokalise") {
    if (input.type === "issue") {
      throw new TmsProviderLiveError(
        "provider_cat_unsupported",
        `Issue comments are not available for ${context.providerKind} files.`,
      );
    }
  }

  if (context.providerKind === "phrase") {
    try {
      return await phraseTmsProvider.saveLiveCatComment({
        secretMaterial: context.secretMaterial,
        region: context.credential.region,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
      });
    } catch (error) {
      mapPhraseLiveCatError(error);
    }
  }

  if (context.providerKind === "lokalise") {
    try {
      return await lokaliseTmsProvider.saveLiveCatComment({
        secretMaterial: context.secretMaterial,
        baseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
      });
    } catch (error) {
      mapLokaliseLiveCatError(error);
    }
  }

  if (context.providerKind === "smartling") {
    try {
      return await smartlingTmsProvider.saveLiveCatComment({
        secretMaterial: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl,
        externalProjectId,
        file,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
        type: input.type,
        issueType: input.issueType,
      });
    } catch (error) {
      mapSmartlingLiveCatError(error);
    }
  }

  return saveCrowdinLiveCatComment({
    context,
    file,
    targetLocale: input.targetLocale,
    externalStringId: input.externalStringId,
    text: input.text,
    type: input.type,
    issueType: input.issueType,
  });
}

export async function resolveTmsProviderLiveCatComment(
  organizationId: string,
  externalProjectId: string,
  sourcePath: string,
  input: {
    externalCommentId: string;
    externalResourceId?: string | null;
  },
  options?: { actorUserId?: string | null },
): Promise<ProjectFileCatComment | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const file = await resolveLiveCatFile({
    organizationId,
    externalProjectId,
    sourcePath,
    externalResourceId: input.externalResourceId,
    context,
  });
  if (!file) {
    return null;
  }

  if (!supportsLiveProviderCat(context.providerKind, file)) {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "CAT comments are not available for this provider file yet.",
    );
  }

  if (context.providerKind !== "crowdin" && context.providerKind !== "smartling") {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "Resolving issue comments is only available for Crowdin and Smartling files.",
    );
  }

  if (context.providerKind === "smartling") {
    try {
      return await smartlingTmsProvider.resolveLiveCatComment({
        secretMaterial: context.secretMaterial,
        authBaseUrl: context.credential.baseUrl,
        externalProjectId,
        externalCommentId: input.externalCommentId,
      });
    } catch (error) {
      mapSmartlingLiveCatError(error);
    }
  }

  return resolveCrowdinLiveCatComment({
    context,
    file,
    externalCommentId: input.externalCommentId,
  });
}

export async function listTmsProviderLiveJobs(
  organizationId: string,
  options?: {
    mine?: boolean;
    assignee?: string | null;
    assigneeCandidates?: string[];
    context?: ActiveTmsProviderContext;
    actorUserId?: string | null;
  },
): Promise<TmsProviderLiveJob[]> {
  const context =
    options?.context ??
    (await loadActiveTmsProviderContext(organizationId, { actorUserId: options?.actorUserId }));

  if (shouldUseCrowdinUserTasksForMine(context, options?.mine)) {
    const projects = await fetchLiveProjectsCached(context, options);
    return listCrowdinUserAssignedLiveJobs({ context, projects });
  }

  const projects = await fetchLiveProjectsCached(context, options);
  const activeProjects = projects.filter((project) => project.isActive !== false);

  const jobsByProject = await mapWithConcurrency(
    activeProjects,
    LIVE_PROJECT_JOB_FANOUT_CONCURRENCY,
    async (project) =>
      listTmsProviderLiveJobsForProject(organizationId, project.externalProjectId, {
        ...options,
        context,
        projects,
      }),
  );

  return jobsByProject.flat();
}

async function fetchCrowdinLiveJobTaskMetadata(input: {
  context: ActiveTmsProviderContext;
  externalProjectId: string;
  externalJobId: string;
}): Promise<ExternalTmsJobTaskMetadata | null> {
  const projectId = Number(input.externalProjectId);
  const taskId = Number(input.externalJobId);
  if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
    return null;
  }

  const client = new CrowdinApiClient({
    token: input.context.secretMaterial,
    baseUrl: input.context.credential.baseUrl ?? undefined,
  });

  let crowdinTask: Awaited<ReturnType<typeof client.getTask>>;
  try {
    crowdinTask = await client.getTask(projectId, taskId);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }
    if (error instanceof CrowdinApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  return crowdinTmsProvider.mapTaskToJobTaskMetadata(crowdinTask, {});
}

async function fetchSmartlingLiveJobTaskMetadata(input: {
  context: ActiveTmsProviderContext;
  externalProjectId: string;
  externalJobId: string;
  enrichResources?: boolean;
}): Promise<ExternalTmsJobTaskMetadata | null> {
  const projectId = input.externalProjectId.trim();
  const jobUid = input.externalJobId.trim();
  if (!projectId || !jobUid) {
    return null;
  }

  const credentials = parseSmartlingCredentials(input.context.secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: input.context.credential.baseUrl ?? undefined,
  });

  let job: SmartlingJobDetails;
  let projectDetails: Awaited<ReturnType<typeof client.getProjectDetails>>;
  try {
    [job, projectDetails] = await Promise.all([
      client.getJob(projectId, jobUid),
      client.getProjectDetails(projectId),
    ]);
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new TmsProviderLiveError(
        "smartling_auth_invalid",
        "Smartling credentials are invalid.",
      );
    }
    if (error instanceof SmartlingApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  let fileIds: string[] | undefined;
  if (input.enrichResources) {
    try {
      const jobFiles = await client.listJobFiles(projectId, jobUid);
      fileIds = jobFiles.map((file) => file.fileUri).filter(Boolean);
    } catch {
      fileIds = [];
    }
  }

  return mapSmartlingJobToLiveTaskMetadata({
    job,
    projectDetails,
    projectId,
    fileIds,
  });
}

function mapSmartlingJobToLiveTaskMetadata(input: {
  job: SmartlingJobDetails;
  projectDetails: Awaited<ReturnType<SmartlingApiClient["getProjectDetails"]>>;
  projectId: string;
  fileIds?: string[];
}): ExternalTmsJobTaskMetadata {
  const normalizedStatus = input.job.jobStatus.toLowerCase().trim();
  const kind = ["in_review", "in-review", "in review", "in_edit", "in-edit", "in edit"].includes(
    normalizedStatus,
  )
    ? "review"
    : "translation";

  return {
    externalJobId: input.job.translationJobUid,
    externalTaskId: null,
    externalStatus: input.job.jobStatus,
    title: input.job.jobName,
    dueDate: input.job.dueDate ? new Date(input.job.dueDate) : null,
    targetLocales: input.job.targetLocaleIds,
    assignedUsers: [],
    externalUrl: `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(input.projectDetails.accountUid)}/project/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.job.translationJobUid)}`,
    providerPayload: {
      description: input.job.description,
      createdDate: input.job.createdDate,
      modifiedDate: input.job.modifiedDate,
      referenceNumber: input.job.referenceNumber,
      jobNumber: input.job.jobNumber,
      rawJobStatus: input.job.jobStatus,
      ...(input.fileIds ? { fileIds: input.fileIds } : {}),
    },
    kind,
  };
}

export async function getTmsProviderLiveProjectLocaleReadiness(
  organizationId: string,
  externalProjectId: string,
  options?: { languageId?: string; actorUserId?: string | null },
): Promise<Record<string, unknown> | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });

  if (context.providerKind === "lokalise") {
    if (!externalProjectId.trim()) {
      return null;
    }

    const client = new LokaliseApiClient({
      token: context.secretMaterial,
      baseUrl: context.credential.baseUrl ?? undefined,
    });

    try {
      return await lokaliseTmsProvider.loadProjectLocaleReadiness({
        client,
        projectId: externalProjectId,
        languageId: options?.languageId,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "lokalise_auth_invalid") {
        throw new TmsProviderLiveError(
          "lokalise_auth_invalid",
          "Lokalise credentials are invalid.",
        );
      }
      throw error;
    }
  }

  if (context.providerKind === "smartling") {
    if (!externalProjectId.trim()) {
      return null;
    }

    const credentials = parseSmartlingCredentials(context.secretMaterial);
    const client = new SmartlingApiClient({
      credentials,
      authBaseUrl: context.credential.baseUrl ?? undefined,
    });

    try {
      return await smartlingTmsProvider.loadProjectLocaleReadiness({
        client,
        projectId: externalProjectId,
        languageId: options?.languageId,
      });
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new TmsProviderLiveError(
          "smartling_auth_invalid",
          "Smartling credentials are invalid.",
        );
      }
      throw error;
    }
  }

  if (context.providerKind !== "crowdin") {
    return null;
  }

  const projectId = Number(externalProjectId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return null;
  }

  const client = new CrowdinApiClient({
    token: context.secretMaterial,
    baseUrl: context.credential.baseUrl ?? undefined,
  });

  const languageIds = options?.languageId?.trim() ? [options.languageId.trim()] : undefined;

  try {
    const progress = await client.listProjectLanguageProgress(projectId, { languageIds });
    return crowdinTmsProvider.mapLanguageProgressToLocaleReadiness(progress);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }
    throw error;
  }
}

export async function getTmsProviderLiveJobDetail(
  organizationId: string,
  encodedJobId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveJobDetail | null> {
  const parsed = parseProviderJobId(encodedJobId);
  if (!parsed) {
    throw new TmsProviderLiveError("invalid_encoded_job_id", "Job id is not a provider job id.");
  }

  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  if (context.providerKind !== parsed.providerKind) {
    return null;
  }

  const projects = await fetchLiveProjectsCached(context, options);
  const project = projects.find((item) => item.externalProjectId === parsed.externalProjectId);
  if (!project) {
    return null;
  }

  let task: ExternalTmsJobTaskMetadata | null;
  if (context.providerKind === "crowdin") {
    task = await fetchCrowdinLiveJobTaskMetadata({
      context,
      externalProjectId: parsed.externalProjectId,
      externalJobId: parsed.externalJobId,
    });
  } else if (context.providerKind === "smartling") {
    task = await fetchSmartlingLiveJobTaskMetadata({
      context,
      externalProjectId: parsed.externalProjectId,
      externalJobId: parsed.externalJobId,
      enrichResources: true,
    });
  } else {
    const fetcher = tmsProviderJobTaskFetchers[context.providerKind];
    if (!fetcher) {
      throw new TmsProviderLiveError(
        "provider_fetcher_unavailable",
        `Live job fetch is not available for ${context.providerKind}.`,
      );
    }

    const liveProject = buildLiveProviderProject({
      organizationId: context.organizationId,
      credentialId: context.credential.id,
      providerKind: context.providerKind,
      externalProjectId: project.externalProjectId,
      name: project.name,
      sourceLocale: project.sourceLocale ?? "en",
      targetLocales: project.targetLocales ?? [],
      externalProjectUrl: project.externalProjectUrl,
      isActive: project.isActive,
    });

    let tasks;
    try {
      tasks = await fetcher({
        organizationId: context.organizationId,
        projectId: liveProject.id,
        providerKind: context.providerKind,
        externalProjectId: parsed.externalProjectId,
        credential: context.credential,
        project: liveProject,
        secretMaterial: context.secretMaterial,
        enrichResources: true,
      });
    } catch (error) {
      rethrowProviderFetcherError(error);
    }

    task = tasks.find((item) => item.externalJobId === parsed.externalJobId) ?? null;
  }

  if (!task) {
    return null;
  }

  return mapLiveJobDetail({
    providerKind: context.providerKind,
    externalProjectId: parsed.externalProjectId,
    externalJobId: parsed.externalJobId,
    projectName: project.name,
    task,
  });
}

async function resolveTmsProviderLiveJobFileIds(
  organizationId: string,
  encodedJobId: string,
  options?: { actorUserId?: string | null },
): Promise<{ externalProjectId: string; fileIds: string[] } | null> {
  const job = await getTmsProviderLiveJobDetail(organizationId, encodedJobId, options);
  if (!job) {
    return null;
  }

  const parsed = parseProviderJobId(encodedJobId);
  if (!parsed) {
    return null;
  }

  return {
    externalProjectId: parsed.externalProjectId,
    fileIds: extractProviderFileIds(job.externalProviderPayload),
  };
}

export async function listTmsProviderLiveJobFiles(
  organizationId: string,
  encodedJobId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveFile[] | null> {
  const resolved = await resolveTmsProviderLiveJobFileIds(organizationId, encodedJobId, options);
  if (!resolved) {
    return null;
  }

  if (resolved.fileIds.length === 0) {
    return [];
  }

  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const projectFiles = await listTmsProviderLiveFilesForProject(
    organizationId,
    resolved.externalProjectId,
    { context, limit: 1000, actorUserId: options?.actorUserId },
  );
  const filesByResourceId = new Map(
    projectFiles.map((file) => [file.provider?.externalResourceId ?? "", file]),
  );

  return resolved.fileIds.flatMap((fileId) => {
    const file = filesByResourceId.get(fileId);
    return file ? [file] : [];
  });
}

export async function getTmsProviderLiveJobFileDetail(
  organizationId: string,
  encodedJobId: string,
  sourcePath: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveFileDetail | null> {
  const files = await listTmsProviderLiveJobFiles(organizationId, encodedJobId, options);
  if (!files) {
    return null;
  }

  const file = files.find((item) => item.sourcePath === sourcePath);
  if (!file) {
    return null;
  }

  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });

  return buildTmsProviderLiveFileDetail(context, file);
}

export async function listTmsProviderLiveJobComments(
  organizationId: string,
  encodedJobId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveJobComment[] | null> {
  const parsed = parseProviderJobId(encodedJobId);
  if (!parsed) {
    throw new TmsProviderLiveError("invalid_encoded_job_id", "Job id is not a provider job id.");
  }

  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  if (context.providerKind !== parsed.providerKind) {
    return null;
  }

  if (context.providerKind === "lokalise") {
    try {
      return await lokaliseTmsProvider.listTaskComments({
        secretMaterial: context.secretMaterial,
        baseUrl: context.credential.baseUrl ?? undefined,
        externalProjectId: parsed.externalProjectId,
        externalJobId: parsed.externalJobId,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "lokalise_auth_invalid") {
        throw new TmsProviderLiveError(
          "lokalise_auth_invalid",
          "Lokalise credentials are invalid.",
        );
      }
      throw error;
    }
  }

  if (context.providerKind !== "crowdin") {
    throw new TmsProviderLiveError(
      "provider_comments_read_unsupported",
      `Task comments are not available for ${context.providerKind}.`,
    );
  }

  const projectId = Number(parsed.externalProjectId);
  const taskId = Number(parsed.externalJobId);
  if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
    return null;
  }

  const client = new CrowdinApiClient({
    token: context.secretMaterial,
    baseUrl: context.credential.baseUrl ?? undefined,
  });

  let comments: Awaited<ReturnType<typeof client.listTaskComments>>;
  try {
    comments = await client.listTaskComments(projectId, taskId);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }
    if (error instanceof CrowdinApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  return comments.map((comment) => ({
    id: `crowdin:task-comment:${comment.id}`,
    externalCommentId: String(comment.id),
    userId: String(comment.userId),
    taskId: String(comment.taskId),
    text: comment.text,
    timeSpentSeconds: comment.timeSpent ?? null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }));
}

export async function updateTmsProviderLiveJobDescription(
  organizationId: string,
  encodedJobId: string,
  description: string,
  actorUserId: string,
): Promise<TmsProviderLiveJobDetail | null> {
  const parsed = parseProviderJobId(encodedJobId);
  if (!parsed) {
    throw new TmsProviderLiveError("invalid_encoded_job_id", "Job id is not a provider job id.");
  }

  const context = await loadActiveTmsProviderContext(organizationId, { actorUserId });
  if (context.providerKind !== parsed.providerKind) {
    return null;
  }

  if (context.providerKind !== "crowdin" && context.providerKind !== "smartling") {
    throw new TmsProviderLiveError(
      "provider_description_edit_unsupported",
      `Description edits are not supported for ${context.providerKind}.`,
    );
  }

  if (context.providerKind === "smartling") {
    const projectId = parsed.externalProjectId.trim();
    const jobUid = parsed.externalJobId.trim();
    if (!projectId || !jobUid) {
      return null;
    }

    const projects = await fetchLiveProjectsCached(context, { actorUserId });
    const project = projects.find((item) => item.externalProjectId === parsed.externalProjectId);
    if (!project) {
      return null;
    }

    const credentials = parseSmartlingCredentials(context.secretMaterial);
    const client = new SmartlingApiClient({
      credentials,
      authBaseUrl: context.credential.baseUrl ?? undefined,
    });

    let updatedJob: SmartlingJobDetails;
    let projectDetails: Awaited<ReturnType<typeof client.getProjectDetails>>;
    try {
      [updatedJob, projectDetails] = await Promise.all([
        client.updateJobDescription(projectId, jobUid, description),
        client.getProjectDetails(projectId),
      ]);
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new TmsProviderLiveError(
          "smartling_auth_invalid",
          "Smartling credentials are invalid.",
        );
      }
      if (error instanceof SmartlingApiError && error.status === 404) {
        return null;
      }
      throw error;
    }

    const task = mapSmartlingJobToLiveTaskMetadata({
      job: updatedJob,
      projectDetails,
      projectId,
    });

    return mapLiveJobDetail({
      providerKind: context.providerKind,
      externalProjectId: parsed.externalProjectId,
      externalJobId: parsed.externalJobId,
      projectName: project.name,
      task,
    });
  }

  const projectId = Number(parsed.externalProjectId);
  const taskId = Number(parsed.externalJobId);
  if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
    return null;
  }

  const projects = await fetchLiveProjectsCached(context, { actorUserId });
  const project = projects.find((item) => item.externalProjectId === parsed.externalProjectId);
  if (!project) {
    return null;
  }

  const crowdinUserConnection = await crowdinAuth.getUserConnection({
    organizationId,
    userId: actorUserId,
  });
  if (!crowdinUserConnection) {
    throw new TmsProviderLiveError(
      "crowdin_user_connection_required",
      "Connect your Crowdin account before editing Crowdin tasks.",
    );
  }

  let userAccessToken: string;
  try {
    userAccessToken = await crowdinAuth.resolveUserConnectionSecretMaterial({
      connection: crowdinUserConnection,
      authMode: context.credential.authMode ?? OAUTH_AUTH_MODE,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "crowdin_oauth_refresh_failed" ||
        error.message === "crowdin_oauth_token_invalid")
    ) {
      throw new TmsProviderLiveError(
        "crowdin_user_auth_invalid",
        "Your Crowdin connection is invalid. Reconnect Crowdin and try again.",
      );
    }

    throw error;
  }

  const client = new CrowdinApiClient({
    token: userAccessToken,
    baseUrl: context.credential.baseUrl ?? undefined,
  });

  let updatedTask: Awaited<ReturnType<typeof client.editTaskDescription>>;
  try {
    updatedTask = await client.editTaskDescription(projectId, taskId, description);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError(
        "crowdin_user_auth_invalid",
        "Your Crowdin connection is invalid. Reconnect Crowdin and try again.",
      );
    }
    if (error instanceof CrowdinApiError && error.status === 404) {
      return null;
    }
    throw error;
  }

  const task = crowdinTmsProvider.mapTaskToJobTaskMetadata(updatedTask, {});
  const providerPayload = Object.fromEntries(
    Object.entries(task.providerPayload ?? {}).filter(([key]) => key !== "localeReadiness"),
  );

  return mapLiveJobDetail({
    providerKind: context.providerKind,
    externalProjectId: parsed.externalProjectId,
    externalJobId: parsed.externalJobId,
    projectName: project.name,
    task: {
      ...task,
      providerPayload,
    },
  });
}

function dedupeGlossaries(items: TmsProviderLiveGlossary[]) {
  const byId = new Map<string, TmsProviderLiveGlossary>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mapLiveGlossary(input: {
  glossary: ExternalTmsGlossaryMetadata;
  externalProjectId: string;
  projectName: string;
  providerKind: ExternalTmsProviderKind;
}): TmsProviderLiveGlossary {
  return {
    id: `${input.providerKind}:glossary:${input.glossary.externalGlossaryId}`,
    name: input.glossary.name,
    description: input.glossary.description ?? null,
    sourceLocale: input.glossary.sourceLocale,
    targetLocale: input.glossary.targetLocale,
    localeCoverage: input.glossary.localeCoverage ?? [],
    termCount: input.glossary.termCount ?? null,
    externalUrl: input.glossary.externalUrl ?? null,
    externalProjectId: input.externalProjectId,
    projectName: input.projectName,
  };
}

export async function listTmsProviderLiveGlossaries(
  organizationId: string,
  options?: { externalProjectId?: string; actorUserId?: string | null },
): Promise<TmsProviderLiveGlossary[]> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const fetcher = tmsProviderGlossaryFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live glossary fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = await fetchLiveProjectsCached(context, options);
  const scopedProjects = options?.externalProjectId
    ? projects.filter((project) => project.externalProjectId === options.externalProjectId)
    : projects.filter((project) => project.isActive !== false);

  const glossariesByProject = await mapWithConcurrency(
    scopedProjects,
    LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY,
    async (project) => {
      const liveProject = buildLiveProviderProject({
        organizationId: context.organizationId,
        credentialId: context.credential.id,
        providerKind: context.providerKind,
        externalProjectId: project.externalProjectId,
        name: project.name,
        sourceLocale: project.sourceLocale ?? "en",
        targetLocales: project.targetLocales ?? [],
        externalProjectUrl: project.externalProjectUrl,
        isActive: project.isActive,
      });

      try {
        const glossaries = await fetcher({
          organizationId: context.organizationId,
          projectId: liveProject.id,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          credential: context.credential,
          project: liveProject,
          secretMaterial: context.secretMaterial,
        });

        return glossaries.map((glossary) =>
          mapLiveGlossary({
            glossary,
            externalProjectId: project.externalProjectId,
            projectName: project.name,
            providerKind: context.providerKind,
          }),
        );
      } catch (error) {
        logger.warn("tms_provider_live_glossary_project_failed", {
          organizationId,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  );

  return dedupeGlossaries(glossariesByProject.flat());
}

function mapLiveTranslationMemory(input: {
  memory: ExternalTmsTranslationMemoryMetadata;
  externalProjectId: string;
  projectName: string;
  providerKind: ExternalTmsProviderKind;
}): TmsProviderLiveTranslationMemory {
  return {
    id: `${input.providerKind}:tm:${input.memory.externalMemoryId}`,
    name: input.memory.name,
    description: input.memory.description ?? null,
    sourceLocale: input.memory.sourceLocale,
    localeCoverage: input.memory.localeCoverage ?? [],
    segmentCount: input.memory.segmentCount ?? null,
    externalUrl: input.memory.externalUrl ?? null,
    externalProjectId: input.externalProjectId,
    projectName: input.projectName,
  };
}

export async function listTmsProviderLiveTranslationMemories(
  organizationId: string,
  options?: { externalProjectId?: string; actorUserId?: string | null },
): Promise<TmsProviderLiveTranslationMemory[]> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const fetcher = tmsProviderTranslationMemoryFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live translation memory fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = await fetchLiveProjectsCached(context, options);
  const scopedProjects = options?.externalProjectId
    ? projects.filter((project) => project.externalProjectId === options.externalProjectId)
    : projects.filter((project) => project.isActive !== false);

  const memoriesByProject = await mapWithConcurrency(
    scopedProjects,
    LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY,
    async (project) => {
      const liveProject = buildLiveProviderProject({
        organizationId: context.organizationId,
        credentialId: context.credential.id,
        providerKind: context.providerKind,
        externalProjectId: project.externalProjectId,
        name: project.name,
        sourceLocale: project.sourceLocale ?? "en",
        targetLocales: project.targetLocales ?? [],
        externalProjectUrl: project.externalProjectUrl,
        isActive: project.isActive,
      });

      try {
        const memories = await fetcher({
          organizationId: context.organizationId,
          projectId: liveProject.id,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          credential: context.credential,
          project: liveProject,
          secretMaterial: context.secretMaterial,
        });

        return memories.map((memory) =>
          mapLiveTranslationMemory({
            memory,
            externalProjectId: project.externalProjectId,
            projectName: project.name,
            providerKind: context.providerKind,
          }),
        );
      } catch (error) {
        logger.warn("tms_provider_live_tm_project_failed", {
          organizationId,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  );

  const byId = new Map<string, TmsProviderLiveTranslationMemory>();
  for (const memory of memoriesByProject.flat()) {
    byId.set(memory.id, memory);
  }

  return [...byId.values()];
}

export function parseTmsProviderProjectRouteId(
  value: string,
): EncodedProviderProjectId | { externalProjectId: string } {
  const encoded = parseProviderProjectId(value);
  if (encoded) {
    return encoded;
  }

  return { externalProjectId: value };
}
