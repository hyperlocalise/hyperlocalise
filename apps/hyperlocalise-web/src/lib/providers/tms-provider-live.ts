import { createLogger } from "@/lib/log";
import { schema } from "@/lib/database";
import { openJobStatusValues } from "@/api/routes/project/job.schema";
import type {
  ProjectFileCatComment,
  ProjectFileCatResponse,
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
import { countCrowdinFileQueueSummary } from "@/lib/projects/cat/project-file-cat-queue-summary";
import {
  legacyProviderCatSegmentLimit,
  maxCrowdinSourceStringCountCeiling,
} from "@/api/routes/project/project.schema";
import { buildCrowdinFileQueueCroql } from "@/lib/providers/adapters/crowdin/crowdin-croql";
import {
  CrowdinApiClient,
  CrowdinApiError,
  type CrowdinLanguageTranslation,
  type CrowdinSourceString,
  type CrowdinStringComment,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { mapCrowdinTaskToJobTaskMetadata } from "@/lib/providers/adapters/crowdin/crowdin-job-task-fetcher";
import {
  getCrowdinUserConnection,
  resolveCrowdinUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/phrase/phrase-user-connections";
import {
  buildPhraseLiveCatFile,
  PhraseLiveCatError,
  savePhraseLiveCatComment,
  savePhraseLiveCatTranslation,
} from "@/lib/providers/adapters/phrase/phrase-live-cat";
import {
  getLokaliseUserConnection,
  resolveLokaliseUserConnectionSecretMaterial,
} from "@/lib/providers/adapters/lokalise/lokalise-user-connections";
import { sourceContentType } from "@/lib/file-storage/source-file-metadata";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { normalizeProviderAssigneeCandidates } from "@/lib/providers/tms-provider-assignee-match";
import {
  API_TOKEN_AUTH_MODE,
  crowdinUsesPerUserAuth,
  OAUTH_AUTH_MODE,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  resolveExternalTmsSecretMaterial,
  type ExternalTmsCredential,
  type ExternalTmsProviderKind,
  type ExternalTmsProviderCredentialSummary,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  tmsProviderGlossaryFetchers,
  tmsProviderFileKeyFetchers,
  tmsProviderJobTaskFetchers,
  tmsProviderProjectFetchers,
  tmsProviderTranslationMemoryFetchers,
} from "@/lib/providers/adapters/tms-provider-adapter-registry";
import { extractProviderFileIds } from "@/lib/providers/job-provider-source-files";
import {
  encodeProviderJobId,
  encodeProviderProjectId,
  parseProviderJobId,
  parseProviderProjectId,
  type EncodedProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";
import {
  mapProviderStatusToNormalized,
  type ExternalTmsFileKeyMetadata,
  type ExternalTmsGlossaryMetadata,
  type ExternalTmsJobTaskMetadata,
  type ExternalTmsProjectMetadata,
  type ExternalTmsTranslationMemoryMetadata,
} from "@/lib/providers/tms-provider-types";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

const logger = createLogger("tms-provider-live");

const LIVE_PROJECT_JOB_FANOUT_CONCURRENCY = 5;
const LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY = 5;
const openLiveJobStatuses = new Set<string>(openJobStatusValues);
const maxLiveProviderInlineTextBytes = 512 * 1024;
const maxLiveProviderStringPreviewItems = 1_000;
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
  openJobCount: number;
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
export type TmsProviderLiveCatFile = ProjectFileCatResponse["catFile"];

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
  options?: { actorUserId?: string | null },
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
    const lokaliseUserConnection = await getLokaliseUserConnection({
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

    return resolveLokaliseUserConnectionSecretMaterial({
      connection: lokaliseUserConnection,
    });
  }

  const crowdinUserConnection = await getCrowdinUserConnection({
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

  return resolveCrowdinUserConnectionSecretMaterial({
    connection: crowdinUserConnection,
    authMode: input.credential.authMode ?? OAUTH_AUTH_MODE,
  });
}

export async function tryLoadActiveTmsProviderContext(
  organizationId: string,
  options?: { actorUserId?: string | null },
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

  return {
    id: encodeProviderProjectId({ providerKind, externalProjectId: project.externalProjectId }),
    name: project.name,
    description: null,
    translationContext: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: project.externalProjectId,
    sourceLocale,
    targetLocales,
    externalProjectUrl: project.externalProjectUrl ?? null,
    isActive: project.isActive ?? true,
    openJobCount: 0,
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

  if (providerKind === "phrase") {
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
      resourceType: input.resourceType ?? (input.providerKind === "phrase" ? "key" : "file"),
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
  context: ActiveTmsProviderContext;
}): Promise<TmsProviderLiveFile | null> {
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

function relevantCrowdinCatComments(input: {
  comments: CrowdinStringComment[];
  stringIds: Set<number>;
  targetLocale: string;
}): Map<number, CrowdinStringComment[]> {
  const commentsByStringId = new Map<number, CrowdinStringComment[]>();

  for (const comment of input.comments) {
    if (!input.stringIds.has(comment.stringId)) {
      continue;
    }

    if (comment.languageId && comment.languageId !== input.targetLocale) {
      continue;
    }

    const comments = commentsByStringId.get(comment.stringId) ?? [];
    comments.push(comment);
    commentsByStringId.set(comment.stringId, comments);
  }

  return commentsByStringId;
}

async function countCrowdinSourceStrings(
  client: CrowdinApiClient,
  projectId: number,
  filter: {
    fileId?: number;
    croql?: string;
  },
  options?: {
    maxCount?: number;
  },
) {
  const ceiling = options?.maxCount ?? maxCrowdinSourceStringCountCeiling;
  let total = 0;
  let offset = 0;

  while (total < ceiling) {
    const page = await client.listSourceStringsPage(projectId, {
      fileId: filter.fileId,
      croql: filter.croql,
      offset,
      limit: 500,
    });
    total += page.strings.length;
    if (!page.hasMore) {
      return total;
    }
    if (total >= ceiling) {
      return ceiling;
    }
    offset += page.strings.length;
  }

  return Math.min(total, ceiling);
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
    let knownFileTotal: number | undefined;

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
      const [countedTotal, page] = await Promise.all([
        countCrowdinSourceStrings(client, projectId, {
          fileId: croql ? undefined : fileId,
          croql,
        }),
        client.listSourceStringsPage(projectId, {
          fileId: croql ? undefined : fileId,
          croql,
          offset: paginationInput.offset,
          limit: paginationInput.limit,
        }),
      ]);

      visibleStrings = page.strings;

      const totalCount = page.hasMore
        ? Math.max(countedTotal, paginationInput.offset + visibleStrings.length + 1)
        : paginationInput.offset + visibleStrings.length;

      pagination = buildCatFilePagination({
        offset: paginationInput.offset,
        limit: paginationInput.limit,
        returnedCount: visibleStrings.length,
        totalCount,
        hasMore: page.hasMore,
      });
      truncated = pagination.hasMore;
      if (!croql) {
        knownFileTotal = countedTotal;
      }
    }

    const sourceStringIds = visibleStrings.map((sourceString) => sourceString.id);
    const sourceStringIdSet = new Set(sourceStringIds);

    const queueSummaryPromise = countCrowdinFileQueueSummary(
      client,
      projectId,
      fileId,
      input.targetLocale,
      { knownTotal: knownFileTotal },
    );

    const translationsByStringId = new Map<number, CrowdinLanguageTranslation[]>();
    const approvalsPromise = client.listTranslationApprovals(projectId, input.targetLocale, {
      fileId,
    });
    try {
      for (let index = 0; index < sourceStringIds.length; index += 25) {
        const chunk = sourceStringIds.slice(index, index + 25);
        const translations = await client.listLanguageTranslations(projectId, input.targetLocale, {
          stringIds: chunk,
        });

        for (const translation of translations) {
          const existing = translationsByStringId.get(translation.stringId) ?? [];
          existing.push(translation);
          translationsByStringId.set(translation.stringId, existing);
        }
      }
    } catch (loopError) {
      await approvalsPromise.catch(() => undefined);
      throw loopError;
    }

    const approvals = await approvalsPromise;
    const approvedTranslationIds = new Set(approvals.map((approval) => approval.translationId));

    const [queueSummary, plainComments, unresolvedIssues] = await Promise.all([
      queueSummaryPromise,
      client.listStringCommentsForStrings(projectId, sourceStringIds, { type: "comment" }),
      client.listStringCommentsForStrings(projectId, sourceStringIds, {
        type: "issue",
        issueStatus: "unresolved",
      }),
    ]);
    const commentsByStringId = relevantCrowdinCatComments({
      comments: [...plainComments, ...unresolvedIssues],
      stringIds: sourceStringIdSet,
      targetLocale: input.targetLocale,
    });

    return {
      sourcePath: input.file.sourcePath,
      filename: input.file.filename,
      provider: input.file.provider,
      targetLocale: input.targetLocale,
      canEditTranslations: input.canEditTranslations,
      truncated,
      pagination,
      queueSummary,
      segments: visibleStrings.map((sourceString) => {
        const target = preferredLanguageTranslation(
          translationsByStringId.get(sourceString.id) ?? [],
          approvedTranslationIds,
        );
        return {
          externalStringId: String(sourceString.id),
          key: sourceString.identifier,
          sourceText: crowdinCatSourceTextValue(sourceString.text),
          context: sourceString.context,
          type: sourceString.type ?? null,
          target: target?.text
            ? {
                text: target.text,
                externalTranslationId:
                  target.translationId != null ? String(target.translationId) : null,
                isApproved:
                  target.translationId != null && approvedTranslationIds.has(target.translationId),
              }
            : null,
          comments: (commentsByStringId.get(sourceString.id) ?? [])
            .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((comment) => mapCrowdinStringComment(comment)),
        };
      }),
    };
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
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

function countOpenLiveJobs(jobs: TmsProviderLiveJob[]): number {
  return jobs.filter((job) => openLiveJobStatuses.has(job.status)).length;
}

async function attachOpenJobCountsToLiveProjects(
  organizationId: string,
  projects: TmsProviderLiveProject[],
  context: ActiveTmsProviderContext,
  liveProjectMetadata: ExternalTmsProjectMetadata[],
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveProject[]> {
  if (projects.length === 0) {
    return projects;
  }

  const counts = await mapWithConcurrency(
    liveProjectMetadata,
    LIVE_PROJECT_JOB_FANOUT_CONCURRENCY,
    async (project) => {
      try {
        const jobs = await listTmsProviderLiveJobsForProject(
          organizationId,
          project.externalProjectId,
          {
            context,
            projects: liveProjectMetadata,
            actorUserId: options?.actorUserId,
          },
        );

        return {
          externalProjectId: project.externalProjectId,
          openJobCount: countOpenLiveJobs(jobs),
        };
      } catch (error) {
        logger.warn(
          {
            organizationId,
            externalProjectId: project.externalProjectId,
            error: error instanceof Error ? error.message : "unknown_error",
          },
          "failed to fetch live jobs for open job count enrichment",
        );

        return {
          externalProjectId: project.externalProjectId,
          openJobCount: 0,
        };
      }
    },
  );

  const openJobCountByExternalProjectId = new Map(
    counts.map((entry) => [entry.externalProjectId, entry.openJobCount]),
  );

  return projects.map((project) => ({
    ...project,
    openJobCount: openJobCountByExternalProjectId.get(project.externalProjectId) ?? 0,
  }));
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

export async function listTmsProviderLiveProjects(
  organizationId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveProject[]> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const projects = await fetchLiveProjects(context);
  const activeProjects = projects.filter((project) => project.isActive !== false);
  const mappedProjects = activeProjects.map((project) =>
    mapLiveProject(context.providerKind, project),
  );

  return attachOpenJobCountsToLiveProjects(
    organizationId,
    mappedProjects,
    context,
    activeProjects,
    options,
  );
}

export async function getTmsProviderLiveProject(
  organizationId: string,
  externalProjectId: string,
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveProject | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });

  if (context.providerKind === "crowdin") {
    const crowdinProjectId = Number(externalProjectId);
    if (!Number.isFinite(crowdinProjectId) || crowdinProjectId <= 0) {
      return null;
    }

    const client = new CrowdinApiClient({
      token: context.secretMaterial,
      baseUrl: context.credential.baseUrl ?? undefined,
    });

    try {
      const project = await client.getProject(crowdinProjectId);
      const projectMetadata: ExternalTmsProjectMetadata = {
        externalProjectId: String(project.id),
        name: project.name,
        sourceLocale: project.sourceLanguageId,
        targetLocales: project.targetLanguageIds,
        externalProjectUrl: project.webUrl,
        isActive: !project.isSuspended,
      };
      const mappedProject = mapLiveProject(context.providerKind, projectMetadata);
      const [projectWithOpenJobCount] = await attachOpenJobCountsToLiveProjects(
        organizationId,
        [mappedProject],
        context,
        [projectMetadata],
        options,
      );
      return projectWithOpenJobCount ?? null;
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 404) {
        return null;
      }
      rethrowProviderFetcherError(error);
    }
  }

  const projects = await listTmsProviderLiveProjects(organizationId, options);
  return projects.find((project) => project.externalProjectId === externalProjectId) ?? null;
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

  const projects = options?.projects ?? (await fetchLiveProjects(context));
  const project = projects.find((item) => item.externalProjectId === externalProjectId);
  if (!project) {
    return [];
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
      externalProjectId,
      credential: context.credential,
      project: liveProject,
      secretMaterial: context.secretMaterial,
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
      projectName: project.name,
      task,
    }),
  );
}

export async function listTmsProviderLiveFilesForProject(
  organizationId: string,
  externalProjectId: string,
  options?: {
    limit?: number;
    context?: ActiveTmsProviderContext;
    projects?: ExternalTmsProjectMetadata[];
    actorUserId?: string | null;
  },
): Promise<TmsProviderLiveFile[]> {
  const context =
    options?.context ??
    (await loadActiveTmsProviderContext(organizationId, { actorUserId: options?.actorUserId }));
  const fetcher = tmsProviderFileKeyFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live file fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = options?.projects ?? (await fetchLiveProjects(context));
  const project = projects.find((item) => item.externalProjectId === externalProjectId);
  if (!project) {
    return [];
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

  let files;
  try {
    files = await fetcher({
      organizationId: context.organizationId,
      projectId: liveProject.id,
      providerKind: context.providerKind,
      externalProjectId,
      credential: context.credential,
      project: liveProject,
      secretMaterial: context.secretMaterial,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }

  return files
    .slice(0, options?.limit ?? 500)
    .map((file) =>
      mapLiveFile({ providerKind: context.providerKind, externalProjectId, file, project }),
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
  options?: { actorUserId?: string | null },
): Promise<TmsProviderLiveFileDetail | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const files = await listTmsProviderLiveFilesForProject(organizationId, externalProjectId, {
    context,
    limit: 1000,
  });
  const file = files.find((item) => item.sourcePath === sourcePath);
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
    pagination?: ProjectFileCatPaginationInput;
  },
): Promise<TmsProviderLiveCatFile | null> {
  const context = await loadActiveTmsProviderContext(organizationId, {
    actorUserId: options?.actorUserId,
  });
  const files = await listTmsProviderLiveFilesForProject(organizationId, externalProjectId, {
    context,
    limit: 1000,
  });
  const file = files.find((item) => item.sourcePath === sourcePath);
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
      return await buildPhraseLiveCatFile({
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
      mapPhraseLiveCatError(error);
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
      return await savePhraseLiveCatTranslation({
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

  if (context.providerKind === "phrase") {
    if (input.type === "issue") {
      throw new TmsProviderLiveError(
        "provider_cat_unsupported",
        "Issue comments are not available for Phrase files.",
      );
    }

    try {
      return await savePhraseLiveCatComment({
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

  if (context.providerKind !== "crowdin") {
    throw new TmsProviderLiveError(
      "provider_cat_unsupported",
      "Resolving issue comments is only available for Crowdin files.",
    );
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
  const projects = await fetchLiveProjects(context);
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

  let progress: Awaited<ReturnType<typeof client.listProjectLanguageProgress>> = [];
  try {
    progress = await client.listProjectLanguageProgress(projectId);
  } catch {
    // Best-effort progress for detail view
  }

  const localeReadiness: Record<string, unknown> = {};
  for (const lang of progress) {
    localeReadiness[lang.languageId] = {
      translationProgress: lang.translationProgress,
      approvalProgress: lang.approvalProgress,
      words: lang.words,
      phrases: lang.phrases,
    };
  }

  return mapCrowdinTaskToJobTaskMetadata(crowdinTask, localeReadiness);
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

  const projects = await fetchLiveProjects(context);
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

  if (context.providerKind !== "crowdin") {
    throw new TmsProviderLiveError(
      "provider_description_edit_unsupported",
      `Description edits are not supported for ${context.providerKind}.`,
    );
  }

  const projectId = Number(parsed.externalProjectId);
  const taskId = Number(parsed.externalJobId);
  if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
    return null;
  }

  const projects = await fetchLiveProjects(context);
  const project = projects.find((item) => item.externalProjectId === parsed.externalProjectId);
  if (!project) {
    return null;
  }

  const crowdinUserConnection = await getCrowdinUserConnection({
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
    userAccessToken = await resolveCrowdinUserConnectionSecretMaterial({
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

  const task = mapCrowdinTaskToJobTaskMetadata(updatedTask, {});
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

  const projects = await fetchLiveProjects(context);
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

  const projects = await fetchLiveProjects(context);
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
