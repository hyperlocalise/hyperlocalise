import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatQueueSegment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { legacyProviderCatSegmentLimit } from "@/api/routes/project/project.schema";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  providerFileFormat,
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import type { ExternalTmsGlossaryMatcherInput } from "@/lib/providers/contracts/glossary-matcher";
import { normalizeProviderGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import {
  TmsProvider,
  type TmsProviderCommentPushScope,
  type TmsProviderContext,
  type TmsProviderFeature,
  type TmsProviderFeatureId,
  type TmsProviderJobScope,
  type TmsProviderProjectScope,
  type TmsProviderPullReviewScope,
  type TmsProviderPushTranslationsScope,
  type TmsProviderSourceFileUploadScope,
} from "@/lib/providers/contracts/tms-provider";
import type { ExternalTmsFileKeyFetcher } from "@/lib/providers/jobs/tms-provider-types";
import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";
import type { ExternalTmsCommentPusher } from "@/lib/providers/shared/provider-feedback-types";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding, ProviderQaSeverity } from "@/lib/providers/provider-job-qa/types";
import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type {
  ProviderReviewThread,
  ProviderReviewThreadKind,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";
import {
  pixelRectToPercentMarkers,
  type CatVisualContext,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

import {
  parseSmartlingCredentials,
  pickSmartlingGlossaryTranslation,
  scoreSmartlingTextMatch,
  SMARTLING_TM_SYNC_MAX_ENTRIES,
  SmartlingApiClient,
  SmartlingApiError,
  uniqueLocales,
  type SmartlingAsyncProcessStatus,
  type SmartlingContextBinding,
  type SmartlingFileLocaleStatus,
  type SmartlingGlossaryEntry,
  type SmartlingIssue,
  type SmartlingIssueTemplate,
  type SmartlingLocaleTranslation,
  type SmartlingSourceString,
  type SmartlingTranslationMemoryEntry,
} from "./smartling-api";

/**
 * Smartling TMS provider adapter.
 *
 * Implements {@link TmsProvider} against the Smartling REST API. Hyperlocalise jobs map to
 * Smartling **translation jobs**; strings are identified by **hashcodes** within project files.
 *
 * Account-scoped glossaries and translation memories are resolved via {@link resolveAccountUid},
 * which reads credentials, project metadata, or live project details. Async upload and job
 * authorization flows poll Smartling progress endpoints before reporting completion.
 *
 * Live CAT helpers exist on {@link SmartlingTmsProvider} but `cat.open` and `cat.visual_context`
 * remain marked unsupported in {@link SmartlingTmsProvider.features} until product wiring is complete.
 */

const implemented = { state: "implemented" } as const satisfies TmsProviderFeature;
const unsupported = { state: "unsupported" } as const satisfies TmsProviderFeature;

const PROJECT_DETAIL_FETCH_CONCURRENCY = 15;
const TRANSLATION_MEMORY_FETCH_CONCURRENCY = 5;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 60;
const MAX_SMARTLING_SCREENSHOTS_PER_SEGMENT = 8;

const HYPERLOCALISE_FINDING_MARKER_PREFIX = "[hyperlocalise:finding=";

/** Typed error surfaced by live CAT operations when Smartling auth or input validation fails. */
export class SmartlingLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SmartlingLiveCatError";
  }
}

/** Builds the Hyperlocalise finding marker embedded in Smartling issue text for idempotent write-back. */
export function buildHyperlocaliseFindingMarker(findingId: string) {
  return `${HYPERLOCALISE_FINDING_MARKER_PREFIX}${findingId}]`;
}

/** Parses a Hyperlocalise finding id from Smartling issue text, if present. */
export function parseHyperlocaliseFindingMarker(issueText: string | null | undefined) {
  if (!issueText) {
    return null;
  }

  const match = issueText.match(/\[hyperlocalise:finding=([^\]]+)\]/);
  return match?.[1] ?? null;
}

type SmartlingProjectLike = {
  sourceLocale?: string | null;
  targetLocales?: string[] | null;
  providerMetadata?: Record<string, unknown> | null;
};

/** One QA finding mapped to a Smartling issue create payload. */
export type SmartlingCommentWriteBackEntry = {
  findingId: string;
  finding: ProviderQaFinding;
  issueTemplate: SmartlingIssueTemplate;
};

type SmartlingLiveCatContext = {
  client: SmartlingApiClient;
  projectId: string;
};

type SmartlingResourceScope = {
  fileUri: string | null;
  hashcode: string | null;
};

type SmartlingQueueSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
};

type LocaleUploadGroup = {
  locale: string;
  entries: Array<{
    hashcode: string;
    translation: string;
    stringText?: string | null;
    instruction?: string | null;
  }>;
};

/**
 * Smartling implementation of the shared TMS provider contract.
 *
 * Use the exported singleton {@link smartlingTmsProvider} in production code.
 */
export class SmartlingTmsProvider extends TmsProvider {
  readonly kind = "smartling" as const;
  readonly label = "Smartling";

  readonly auth = {
    workspaceCredential: true,
    userConnection: false,
  };

  readonly resourceSupport = {
    providerCat: {
      file: false,
      key: false,
    },
  };

  readonly features = {
    "projects.read": implemented,
    "projects.write": unsupported,
    "locales.read": implemented,
    "locales.write": unsupported,
    "files.upload": implemented,
    "files.download": implemented,
    "keys.read": implemented,
    "keys.write": implemented,
    "jobs.create": implemented,
    "jobs.read": implemented,
    "tasks.create": unsupported,
    "tasks.read": implemented,
    "comments.read": implemented,
    "comments.write": implemented,
    "status_transitions.read": implemented,
    "status_transitions.write": implemented,
    "translation_memory.import": implemented,
    "translation_memory.export": implemented,
    "translation_memory.search": implemented,
    "glossary.import": implemented,
    "glossary.export": implemented,
    "glossary.search": implemented,
    "qa.run": implemented,
    "review.pull": implemented,
    "webhooks.receive": implemented,
    "webhooks.configure": implemented,
    "write_back.source": implemented,
    "write_back.translation": implemented,
    "cat.open": unsupported,
    "cat.visual_context": unsupported,
    "auth.user_scoped": unsupported,
  } satisfies Record<TmsProviderFeatureId, TmsProviderFeature>;

  /** Builds an authenticated {@link SmartlingApiClient} from provider scope credentials. */
  private createClient(input: {
    credential: { baseUrl?: string | null };
    secretMaterial: string;
    fetchFn?: typeof fetch;
  }) {
    return new SmartlingApiClient({
      credentials: parseSmartlingCredentials(input.secretMaterial),
      authBaseUrl: input.credential.baseUrl ?? undefined,
      fetchFn: input.fetchFn,
    });
  }

  /** Normalizes Smartling API failures into stable Hyperlocalise error codes. */
  private mapSmartlingFetcherError(error: unknown): Error {
    if (error instanceof SmartlingApiError) {
      if (error.code === "smartling_auth_invalid" || error.status === 401) {
        return new Error("smartling_auth_invalid");
      }
      if (error.code === "smartling_api_unavailable") {
        return new Error("smartling_api_unavailable");
      }
    }
    return error instanceof Error ? error : new Error("smartling_request_failed");
  }

  /**
   * Resolves the Smartling account UID from credentials, cached project metadata, or project details.
   */
  private async resolveAccountUid(input: {
    secretMaterial: string;
    authBaseUrl?: string;
    externalProjectId: string;
    project?: SmartlingProjectLike;
  }): Promise<string | null> {
    const credentials = parseSmartlingCredentials(input.secretMaterial);
    if (credentials.accountUid?.trim()) {
      return credentials.accountUid.trim();
    }

    const metadataAccountUid = readMetadataAccountUid(input.project?.providerMetadata);
    if (metadataAccountUid) {
      return metadataAccountUid;
    }

    const projectId = input.externalProjectId.trim() || credentials.projectId?.trim();
    if (!projectId) {
      return null;
    }

    const client = new SmartlingApiClient({
      credentials,
      authBaseUrl: input.authBaseUrl,
    });
    try {
      const details = await client.getProjectDetails(projectId);
      return details.accountUid?.trim() || null;
    } catch {
      return null;
    }
  }

  /** Polls a Smartling async process until a terminal state or timeout. */
  private async pollAsyncProcess(input: {
    client: SmartlingApiClient;
    projectId: string;
    processUid: string;
    pollIntervalMs?: number;
    maxAttempts?: number;
  }) {
    const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

    let lastStatus: SmartlingAsyncProcessStatus = { processUid: input.processUid };
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      lastStatus = await input.client.getAsyncProcessStatus(input.projectId, input.processUid);
      if (isTerminalProcessState(lastStatus)) {
        if (isFailedProcessState(lastStatus)) {
          throw new Error(
            `smartling_async_process_failed:${lastStatus.processState ?? lastStatus.processStatus ?? "unknown"}`,
          );
        }
        return lastStatus;
      }
      await sleep(pollIntervalMs);
    }

    throw new Error("smartling_async_process_timeout");
  }

  /** Polls Smartling job progress until completion or timeout. */
  private async pollJobProgress(input: {
    client: SmartlingApiClient;
    projectId: string;
    translationJobUid: string;
    targetLocaleId?: string;
    pollIntervalMs?: number;
    maxAttempts?: number;
  }): Promise<Record<string, unknown>> {
    const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

    let lastProgress: Record<string, unknown> = {};
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const progress = await input.client.getJobProgress(
        input.projectId,
        input.translationJobUid,
        input.targetLocaleId,
      );
      lastProgress = progress as Record<string, unknown>;
      const percent =
        typeof progress.percentComplete === "number"
          ? progress.percentComplete
          : progress.totalWordCount && progress.completedWordCount
            ? (progress.completedWordCount / progress.totalWordCount) * 100
            : null;

      if (percent != null && percent >= 100) {
        return lastProgress;
      }

      await sleep(pollIntervalMs);
    }

    throw new Error("smartling_job_progress_timeout");
  }

  /** Lists discoverable Smartling projects and enriches locale metadata when summaries are sparse. */
  async fetchProjects(context: TmsProviderContext) {
    const client = this.createClient(context);

    let summaries;
    try {
      summaries = await client.listDiscoverableProjects();
    } catch (error) {
      if (error instanceof SmartlingApiError) {
        if (error.code === "smartling_auth_invalid" || error.status === 401) {
          throw new Error("smartling_auth_invalid");
        }
        if (error.code === "smartling_api_unavailable") {
          throw new Error("smartling_api_unavailable");
        }
      }
      if (error instanceof Error && error.message === "smartling_account_uid_required") {
        throw error;
      }
      throw error;
    }

    return mapInBatches(summaries, PROJECT_DETAIL_FETCH_CONCURRENCY, async (summary) => {
      if (summary.targetLocales.length > 0) {
        return normalizeSmartlingProject(summary);
      }

      try {
        const details = await client.getProjectDetails(summary.projectId);
        return normalizeSmartlingProject(details);
      } catch (error) {
        if (error instanceof SmartlingApiError && error.status === 401) {
          throw new Error("smartling_auth_invalid");
        }
        if (error instanceof SmartlingApiError && error.code === "smartling_api_unavailable") {
          throw new Error("smartling_api_unavailable");
        }

        return normalizeSmartlingProject(summary, {
          syncWarning: error instanceof Error ? error.message : "project_details_fetch_failed",
        });
      }
    });
  }

  /**
   * Discovers file- and key-level resources for a Smartling project.
   *
   * Files include locale readiness from Smartling file status endpoints; keys are synthesized
   * from source strings per file.
   */
  async fetchFileKeys(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);

    if (!scope.externalProjectId.trim()) {
      throw new Error("invalid_smartling_project_id");
    }

    let projectDetails;
    try {
      projectDetails = await client.getProjectDetails(scope.externalProjectId);
    } catch (error) {
      throw this.mapSmartlingFetcherError(error);
    }

    const targetLocales = projectDetails.targetLocales
      .filter((locale) => locale.enabled !== false)
      .map((locale) => locale.localeId);
    const accountUid = projectDetails.accountUid;

    let files;
    try {
      files = await client.listProjectFiles(scope.externalProjectId);
    } catch (error) {
      throw this.mapSmartlingFetcherError(error);
    }

    const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];

    for (const file of files) {
      let localeReadiness: Record<string, unknown> = {};
      try {
        const statuses = await client.getFileStatusForAllLocales(
          scope.externalProjectId,
          file.fileUri,
        );
        localeReadiness = Object.fromEntries(
          statuses.map((status) => [
            status.localeId,
            {
              completedStringCount: status.completedStringCount,
              authorizedStringCount: status.authorizedStringCount,
              lastCompleted: status.lastCompleted,
              lastAuthorized: status.lastAuthorized,
            },
          ]),
        );
      } catch {
        // Locale status is best-effort; do not fail file sync if it is unavailable
      }

      results.push({
        externalResourceId: file.fileUri,
        resourceType: "file",
        sourcePath: file.fileUri,
        displayName: displayNameOf(file.fileUri),
        format: file.fileType ?? null,
        sourceLocale: projectDetails.sourceLocaleId,
        targetLocales,
        revision: file.lastUploaded ?? null,
        externalUrl: buildSmartlingFileUrl(accountUid, scope.externalProjectId, file.fileUri),
        syncState: "synced",
        localeReadiness,
        providerPayload: {
          fileUri: file.fileUri,
          fileType: file.fileType,
          lastUploaded: file.lastUploaded,
          hasInstructions: file.hasInstructions,
          directives: file.directives ?? null,
        },
      });
    }

    for (const file of files) {
      try {
        const strings = await client.listSourceStrings(scope.externalProjectId, {
          fileUri: file.fileUri,
        });

        for (const str of strings) {
          const keyPath = `${file.fileUri}/keys/${str.hashcode}`;
          results.push({
            externalResourceId: `${file.fileUri}::${str.hashcode}`,
            resourceType: "key",
            sourcePath: keyPath,
            displayName: str.stringText ?? str.hashcode,
            sourceLocale: projectDetails.sourceLocaleId,
            targetLocales,
            externalUrl: buildSmartlingFileUrl(accountUid, scope.externalProjectId, file.fileUri),
            providerPayload: {
              hashcode: str.hashcode,
              stringText: str.stringText,
              fileUri: str.fileUri ?? file.fileUri,
              variant: str.variant,
              stringVariantUid: str.stringVariantUid,
              createdDate: str.createdDate,
              modifiedDate: str.modifiedDate,
              metadata: str.metadata ?? null,
            },
          });
        }
      } catch (error) {
        const mapped = this.mapSmartlingFetcherError(error);
        if (mapped.message === "smartling_auth_invalid") {
          throw mapped;
        }

        results.push({
          externalResourceId: file.fileUri,
          resourceType: "key",
          sourcePath: `${file.fileUri}/keys`,
          displayName: `${displayNameOf(file.fileUri)} keys`,
          syncErrorMessage: `Failed to list source strings for ${file.fileUri}: ${mapped.message}`,
          providerPayload: {
            fileUri: file.fileUri,
            fileType: file.fileType,
          },
        });
      }
    }

    return results;
  }

  /**
   * Lists Smartling translation jobs as Hyperlocalise jobs.
   *
   * Optionally enriches jobs with file ids and locale readiness when requested on the scope.
   */
  async fetchJobTasks(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);

    if (!scope.externalProjectId.trim()) {
      throw new Error("invalid_smartling_project_id");
    }

    let projectDetails;
    let jobs;
    try {
      [projectDetails, jobs] = await Promise.all([
        client.getProjectDetails(scope.externalProjectId),
        client.listJobs(scope.externalProjectId),
      ]);
    } catch (error) {
      throw this.mapSmartlingFetcherError(error);
    }

    const accountUid = projectDetails.accountUid;
    const projectLocaleReadiness = scope.includeLocaleProgress
      ? await this.loadProjectLocaleReadiness({ client, projectId: scope.externalProjectId })
      : null;

    return Promise.all(
      jobs.map(async (job) => {
        let fileIds: string[] | undefined;
        let localeReadiness: Record<string, unknown> | undefined;

        if (scope.enrichResources) {
          try {
            const jobFiles = await client.listJobFiles(
              scope.externalProjectId,
              job.translationJobUid,
            );
            fileIds = jobFiles.map((file) => file.fileUri).filter(Boolean);
          } catch {
            fileIds = [];
          }
        }

        if (scope.includeLocaleProgress) {
          localeReadiness =
            projectLocaleReadiness ??
            (await loadSmartlingJobProgress(
              client,
              scope.externalProjectId,
              job.translationJobUid,
            ));
        }

        return {
          externalJobId: job.translationJobUid,
          externalTaskId: null,
          externalStatus: job.jobStatus,
          title: job.jobName,
          dueDate: job.dueDate ? new Date(job.dueDate) : null,
          targetLocales: job.targetLocaleIds,
          assignedUsers: [],
          externalUrl: buildSmartlingJobUrl(
            accountUid,
            scope.externalProjectId,
            job.translationJobUid,
          ),
          providerPayload: {
            description: job.description,
            createdDate: job.createdDate,
            modifiedDate: job.modifiedDate,
            referenceNumber: job.referenceNumber,
            jobNumber: job.jobNumber,
            rawJobStatus: job.jobStatus,
            ...(fileIds ? { fileIds } : {}),
            ...(localeReadiness ? { localeReadiness } : {}),
          },
          kind: mapSmartlingJobKind(job.jobStatus),
        };
      }),
    );
  }

  /**
   * Imports account glossaries as live-search glossary rows per target locale.
   *
   * Term bodies are fetched on demand during glossary matching rather than at sync time.
   */
  async fetchGlossaries(scope: TmsProviderProjectScope) {
    const accountUid = await this.resolveAccountUid({
      secretMaterial: scope.secretMaterial,
      authBaseUrl: scope.credential.baseUrl ?? undefined,
      externalProjectId: scope.externalProjectId,
      project: scope.project,
    });
    if (!accountUid) {
      throw new Error("smartling_account_uid_required");
    }

    const client = new SmartlingApiClient({
      credentials: scope.secretMaterial,
      authBaseUrl: scope.credential.baseUrl ?? undefined,
    });

    let glossaries;
    try {
      glossaries = await client.listAccountGlossaries(accountUid);
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale ?? "en";
    const targetLocales = scope.project.targetLocales ?? [];
    if (targetLocales.length === 0) {
      return [];
    }
    const glossaryTargetLocales = uniqueLocales(targetLocales);

    return glossaries
      .filter((glossary) => glossary.glossaryUid)
      .flatMap((glossary) =>
        glossaryTargetLocales.map((targetLocale) => ({
          externalGlossaryId: glossary.glossaryUid,
          name: glossary.name || glossary.glossaryUid,
          description: glossary.description ?? "",
          sourceLocale,
          targetLocale,
          externalResourceType: "glossary" as const,
          localeCoverage: uniqueLocales([sourceLocale, targetLocale, ...glossary.localeIds]),
          termCount: null,
          termCapabilities: { mode: "live_search" },
          metadata: {
            smartlingGlossaryUid: glossary.glossaryUid,
            smartlingAccountUid: accountUid,
          },
          terms: [],
        })),
      );
  }

  /**
   * Imports translation memory segments linked to the Smartling account.
   *
   * Segment import is capped at {@link SMARTLING_TM_SYNC_MAX_ENTRIES} per memory.
   */
  async fetchTranslationMemories(scope: TmsProviderProjectScope) {
    const authBaseUrl = scope.credential.baseUrl ?? undefined;
    const accountUid = await this.resolveAccountUid({
      secretMaterial: scope.secretMaterial,
      externalProjectId: scope.externalProjectId,
      project: scope.project,
      authBaseUrl,
    });
    if (!accountUid) {
      throw new Error("smartling_account_uid_required");
    }

    const client = new SmartlingApiClient({ credentials: scope.secretMaterial, authBaseUrl });

    let memories;
    try {
      memories = await client.listAccountTranslationMemories(accountUid);
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale ?? "en";
    const targetLocales = uniqueLocales(scope.project.targetLocales ?? []);

    return mapInBatches(
      memories.filter((memory) => memory.translationMemoryUid),
      TRANSLATION_MEMORY_FETCH_CONCURRENCY,
      async (memory) => {
        const memorySourceLocale = memory.sourceLocaleId || sourceLocale;
        const entryTargetLocales = uniqueLocales([
          ...targetLocales,
          ...memory.localeIds.filter((locale) => locale !== memorySourceLocale),
        ]);

        try {
          let syncedEntryCount = 0;
          const segments = await client.listTranslationMemoryEntries(
            accountUid,
            memory.translationMemoryUid,
            {
              sourceLocaleId: memorySourceLocale,
              targetLocaleIds: entryTargetLocales,
              shouldStop: (page) => {
                syncedEntryCount += countTranslationMemoryEntries({
                  segments: page,
                  targetLocales: entryTargetLocales,
                });
                return syncedEntryCount >= SMARTLING_TM_SYNC_MAX_ENTRIES;
              },
            },
          );
          const syncedEntries = buildTranslationMemoryEntries({
            translationMemoryUid: memory.translationMemoryUid,
            sourceLanguageId: memorySourceLocale,
            targetLocales: entryTargetLocales,
            segments,
          }).slice(0, SMARTLING_TM_SYNC_MAX_ENTRIES);

          return {
            externalMemoryId: memory.translationMemoryUid,
            name: memory.name,
            description: memory.description ?? "",
            sourceLocale: memorySourceLocale,
            localeCoverage: uniqueLocales([memorySourceLocale, ...memory.localeIds]),
            segmentCount: syncedEntries.length,
            metadata: {
              smartlingTranslationMemoryUid: memory.translationMemoryUid,
              smartlingAccountUid: accountUid,
              importedSegmentCount: syncedEntries.length,
            },
            entries: syncedEntries,
          };
        } catch (error) {
          if (error instanceof SmartlingApiError && error.status === 401) {
            throw new Error("smartling_auth_invalid");
          }

          return {
            externalMemoryId: memory.translationMemoryUid,
            name: memory.name,
            description: memory.description ?? "",
            sourceLocale: memorySourceLocale,
            localeCoverage: uniqueLocales([memorySourceLocale, ...memory.localeIds]),
            segmentCount: null,
            syncErrorMessage:
              error instanceof Error ? error.message : "translation_memory_sync_failed",
            metadata: {
              smartlingTranslationMemoryUid: memory.translationMemoryUid,
              smartlingAccountUid: accountUid,
            },
            entries: [],
          };
        }
      },
    );
  }

  /**
   * Pulls source strings and target translations for a Smartling translation job.
   *
   * Matches translations to source strings by hashcode and optional file URI prefixes.
   */
  async pullTaskContent(scope: TmsProviderJobScope) {
    const client = new SmartlingApiClient({
      credentials: scope.secretMaterial,
      authBaseUrl: scope.credential.baseUrl ?? undefined,
    });

    const projectId = scope.externalProjectId.trim();
    const jobUid = scope.externalJobId.trim();
    if (!projectId || !jobUid) {
      throw new Error("invalid_smartling_project_or_job_id");
    }

    let job;
    let projectDetails;
    let jobFiles;
    try {
      [job, projectDetails, jobFiles] = await Promise.all([
        client.getJob(projectId, jobUid),
        client.getProjectDetails(projectId),
        client.listJobFiles(projectId, jobUid),
      ]);
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      throw this.mapSmartlingFetcherError(error);
    }

    const targetLocales = job.targetLocaleIds.length > 0 ? job.targetLocaleIds : [];
    const fileUris = jobFiles.map((file) => file.fileUri).filter(Boolean);

    const sourceStrings = [];
    if (fileUris.length > 0) {
      for (const fileUri of fileUris) {
        sourceStrings.push(...(await client.listSourceStrings(projectId, { fileUri })));
      }
    } else {
      sourceStrings.push(...(await client.listSourceStrings(projectId)));
    }

    const translationsByKey = new Map<
      string,
      Array<{
        locale: string;
        text: string;
        isApproved: boolean;
        externalTranslationId: string | null;
      }>
    >();

    for (const locale of targetLocales) {
      const fileScopes = fileUris.length > 0 ? fileUris : [undefined];
      for (const fileUri of fileScopes) {
        const localeTranslations = await client.listLocaleTranslations(
          projectId,
          locale,
          fileUri ? { fileUri } : undefined,
        );
        for (const translation of localeTranslations) {
          const key = translationLookupKey({
            ...translation,
            fileUri: translation.fileUri ?? fileUri ?? null,
          });
          if (!key || !translation.translation) {
            continue;
          }

          const existing = translationsByKey.get(key) ?? [];
          existing.push({
            locale,
            text: translation.translation,
            isApproved: isApprovedTranslation(translation),
            externalTranslationId: translation.hashcode ?? null,
          });
          translationsByKey.set(key, existing);
        }
      }
    }

    const units = sourceStrings.map((sourceString) => {
      const lookupKeys = [
        translationLookupKey({
          hashcode: sourceString.hashcode,
          fileUri: sourceString.fileUri,
        }),
        translationLookupKey({
          fileUri: sourceString.fileUri,
          stringText: sourceString.stringText,
        }),
      ].filter((key): key is string => Boolean(key));

      const matchedTranslations =
        lookupKeys.map((key) => translationsByKey.get(key)).find((value) => value != null) ?? [];

      return {
        externalStringId: sourceString.hashcode,
        key: sourceString.variant ?? sourceString.hashcode,
        sourceText: sourceString.stringText ?? "",
        context:
          typeof sourceString.metadata?.instruction === "string"
            ? sourceString.metadata.instruction
            : null,
        fileId: sourceString.fileUri ?? null,
        translations: matchedTranslations,
        providerPayload: {
          fileUri: sourceString.fileUri,
          variant: sourceString.variant,
          stringVariantUid: sourceString.stringVariantUid,
        },
      };
    });

    return {
      externalJobId: job.translationJobUid,
      externalTaskId: null,
      sourceLocale: projectDetails.sourceLocaleId ?? null,
      targetLocales,
      units,
      exportArtifact: null,
      providerPayload: {
        jobName: job.jobName,
        jobStatus: job.jobStatus,
        fileUris,
        description: job.description,
        referenceNumber: job.referenceNumber,
        jobNumber: job.jobNumber,
      },
    };
  }

  /**
   * Uploads a source file to Smartling and returns the async process id when Smartling provides one.
   */
  async uploadSourceFile(
    scope: TmsProviderSourceFileUploadScope,
  ): Promise<
    Result<
      Awaited<ReturnType<TmsProvider["uploadSourceFile"]>> extends Result<infer Value, unknown>
        ? Value
        : never,
      Awaited<ReturnType<TmsProvider["uploadSourceFile"]>> extends Result<unknown, infer Error>
        ? Error
        : never
    >
  > {
    const client = this.createClient(scope);
    const sourcePath = providerSourcePath(scope.file);
    const fileType = providerFileFormat(scope.file);
    if (!fileType) {
      return err({ code: "smartling_source_file_type_required" });
    }

    const result = await client.uploadSourceFile(scope.externalProjectId, {
      fileUri: sourcePath,
      fileType,
      filename: providerFilename(scope.file),
      content: scope.file.content,
      contentType: scope.file.contentType,
    });

    return ok({
      sourcePath,
      externalResourceId: result.fileUri,
      revision: null,
      asyncOperation: result.processUid
        ? {
            provider: "smartling",
            processUid: result.processUid,
          }
        : null,
      providerPayload: {
        fileUri: result.fileUri,
        fileType: result.fileType,
        processUid: result.processUid,
        ...result.providerPayload,
      },
    });
  }

  /**
   * Writes approved translations to Smartling and authorizes the linked translation job.
   *
   * Polls job progress per locale after authorization when uploads succeed.
   */
  async pushTranslations(scope: TmsProviderPushTranslationsScope) {
    const client = new SmartlingApiClient({
      credentials: scope.secretMaterial,
      authBaseUrl: scope.credential.baseUrl ?? undefined,
    });

    const projectId = scope.externalProjectId.trim();
    const jobUid = scope.externalJobId.trim();
    if (!projectId || !jobUid) {
      throw new Error("invalid_smartling_project_or_job_id");
    }

    try {
      await client.getJob(projectId, jobUid);
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      throw this.mapSmartlingFetcherError(error);
    }

    let uploaded = 0;
    let failed = 0;
    const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];
    const asyncOperations: Array<Record<string, unknown>> = [];

    const groups = new Map<string, LocaleUploadGroup>();
    for (const translation of scope.translations) {
      const locale = translation.locale.trim();
      const hashcode = translation.externalStringId?.trim();
      if (!locale) {
        failed += 1;
        failures.push({
          locale: translation.locale,
          fileId: translation.fileId ?? null,
          message: "smartling_translation_missing_locale",
        });
        continue;
      }
      if (!hashcode) {
        failed += 1;
        failures.push({
          locale,
          fileId: translation.fileId ?? null,
          message: "smartling_translation_missing_hashcode",
        });
        continue;
      }

      const text = translation.text.trim();
      if (!text) {
        failed += 1;
        failures.push({
          locale,
          fileId: translation.fileId ?? null,
          message: "smartling_translation_missing_text",
        });
        continue;
      }

      const existing = groups.get(locale) ?? { locale, entries: [] };
      existing.entries.push({
        hashcode,
        translation: text,
        stringText: translation.key ?? null,
      });
      groups.set(locale, existing);
    }

    if (groups.size === 0) {
      return { uploaded, failed, failures, asyncOperations };
    }

    const localesToAuthorize = new Set<string>();
    for (const group of groups.values()) {
      try {
        await client.upsertLocaleTranslations(projectId, group.locale, group.entries);
        uploaded += group.entries.length;
        localesToAuthorize.add(group.locale);
        asyncOperations.push({
          type: "smartling_upsert_translations",
          locale: group.locale,
          count: group.entries.length,
          status: "succeeded",
        });
      } catch (error) {
        failed += group.entries.length;
        failures.push({
          locale: group.locale,
          fileId: null,
          message: error instanceof Error ? error.message : "smartling translation upload failed",
        });
        asyncOperations.push({
          type: "smartling_upsert_translations",
          locale: group.locale,
          status: "failed",
          error: error instanceof Error ? error.message : "smartling translation upload failed",
        });
      }
    }

    if (localesToAuthorize.size > 0) {
      try {
        const authorizeResult = await client.authorizeJob(projectId, jobUid, [
          ...localesToAuthorize,
        ]);
        asyncOperations.push({
          type: "smartling_authorize_job",
          translationJobUid: jobUid,
          targetLocaleIds: [...localesToAuthorize],
          result: authorizeResult,
        });

        for (const locale of localesToAuthorize) {
          try {
            const progress = await this.pollJobProgress({
              client,
              projectId,
              translationJobUid: jobUid,
              targetLocaleId: locale,
            });
            asyncOperations.push({
              type: "smartling_job_progress",
              translationJobUid: jobUid,
              locale,
              status: "succeeded",
              progress,
            });
          } catch (error) {
            asyncOperations.push({
              type: "smartling_job_progress",
              translationJobUid: jobUid,
              locale,
              status: "failed",
              error:
                error instanceof Error ? error.message : "smartling job progress polling failed",
            });
            failures.push({
              locale,
              fileId: null,
              message:
                error instanceof Error ? error.message : "smartling job progress polling failed",
            });
          }
        }
      } catch (error) {
        asyncOperations.push({
          type: "smartling_authorize_job",
          translationJobUid: jobUid,
          status: "failed",
          error: error instanceof Error ? error.message : "smartling job authorization failed",
        });
        for (const locale of localesToAuthorize) {
          failures.push({
            locale,
            fileId: null,
            message: error instanceof Error ? error.message : "smartling job authorization failed",
          });
        }
      }
    }

    return { uploaded, failed, failures, asyncOperations };
  }

  /**
   * Pulls Smartling string issues for job-scoped hashcodes into a normalized provider review report.
   */
  async pullReview(scope: TmsProviderPullReviewScope & { fetchFn?: typeof fetch }) {
    const projectId = scope.externalProjectId.trim();
    const jobUid = scope.externalJobId.trim();
    if (!projectId || !jobUid) {
      throw new Error("invalid_smartling_project_or_job_id");
    }

    const client = this.createClient({
      credential: scope.credential,
      secretMaterial: scope.secretMaterial,
      fetchFn: scope.fetchFn,
    });

    let projectDetails: Awaited<ReturnType<typeof client.getProjectDetails>>;
    let jobFiles: Awaited<ReturnType<typeof client.listJobFiles>>;
    try {
      [projectDetails, jobFiles] = await Promise.all([
        client.getProjectDetails(projectId),
        client.listJobFiles(projectId, jobUid),
      ]);
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      throw error;
    }

    const stringKeyById = new Map(
      scope.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
    );

    const hashcodes = new Set<string>();
    for (const unit of scope.content.units) {
      const hashcode = unit.externalStringId.trim();
      if (hashcode) {
        hashcodes.add(hashcode);
      }
    }

    const fileUris = jobFiles.map((file) => file.fileUri).filter(Boolean);
    if (fileUris.length > 0) {
      const hashcodesByFile = await mapWithConcurrency(fileUris, 5, async (fileUri) => {
        const strings = await client.listSourceStrings(projectId, { fileUri });
        return strings
          .map((sourceString) => sourceString.hashcode?.trim() ?? "")
          .filter((hashcode) => hashcode.length > 0);
      });

      for (const fileHashcodes of hashcodesByFile) {
        for (const hashcode of fileHashcodes) {
          hashcodes.add(hashcode);
        }
      }
    }

    const hashcodeList = [...hashcodes];
    const issues: Awaited<ReturnType<typeof client.listIssues>> = [];

    if (hashcodeList.length === 0) {
      return buildProviderReviewReport([]);
    }

    for (const chunk of chunkArray(hashcodeList, 50)) {
      const pageIssues = await client.listIssues(projectId, {
        stringFilter: { hashcodes: chunk },
      });
      issues.push(...pageIssues);
    }

    const projectWebUrl = buildSmartlingProjectUrl(projectDetails.accountUid, projectId);
    const threads = issues.map((issue) =>
      normalizeSmartlingIssueToThread({
        issue,
        externalProjectId: projectId,
        externalJobId: jobUid,
        stringKeyById,
        projectWebUrl,
      }),
    );

    const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));
    return buildProviderReviewReport([...deduped.values()]);
  }

  /**
   * Pushes QA findings to Smartling as issues tagged with Hyperlocalise finding markers.
   *
   * Skips findings whose marker already exists remotely or in `knownExternalIds`.
   */
  async pushComments(scope: TmsProviderCommentPushScope) {
    const client = new SmartlingApiClient({ credentials: scope.secretMaterial });
    const projectId = scope.externalProjectId.trim();

    if (!projectId) {
      throw new Error("invalid_smartling_project_id");
    }

    const locales = new Set(
      scope.feedback.map((item) => item.finding.item.locale?.trim()).filter(Boolean),
    );
    const defaultLocaleId = locales.size === 1 ? ([...locales][0] ?? null) : null;

    const { entries, failures: validationFailures } = buildSmartlingCommentWriteBackEntries({
      findings: scope.feedback.map((item) => item.finding),
      defaultLocaleId,
    });

    const entryByFindingId = new Map(entries.map((entry) => [entry.findingId, entry]));
    const changedItems: Awaited<ReturnType<ExternalTmsCommentPusher>>["changedItems"] = [];
    const failures = [...validationFailures];
    let posted = 0;
    let skipped = 0;
    let failed = validationFailures.length;

    const feedbackByFindingId = new Map(
      scope.feedback.map((item) => [item.findingId || buildFindingId(item.finding), item]),
    );

    for (const failure of validationFailures) {
      const item = feedbackByFindingId.get(failure.findingId);
      changedItems.push({
        type: "provider_comment",
        findingId: failure.findingId,
        status: "failed",
        hashcode: item?.finding.item.externalStringId?.trim() || null,
        locale: item?.finding.item.locale?.trim() || null,
        message: failure.message,
      });
    }

    const hashcodes = [
      ...new Set(
        entries
          .map((entry) => entry.issueTemplate.string.hashcode)
          .filter((hashcode) => hashcode.length > 0),
      ),
    ];

    const remoteIssueIdsByFindingId = new Map<string, string>();
    if (hashcodes.length > 0) {
      try {
        const remoteIssues = await client.listIssues(projectId, {
          stringFilter: { hashcodes },
          issueStateCodes: ["OPENED"],
          limit: 500,
        });

        for (const issue of remoteIssues) {
          const findingId = parseHyperlocaliseFindingMarker(issue.issueText);
          if (findingId && issue.issueUid) {
            remoteIssueIdsByFindingId.set(findingId, issue.issueUid);
          }
        }
      } catch (error) {
        if (error instanceof SmartlingApiError && error.status === 401) {
          throw new Error("smartling_auth_invalid");
        }
        throw this.mapSmartlingFetcherError(error);
      }
    }

    for (const item of scope.feedback) {
      const findingId = item.findingId || buildFindingId(item.finding);
      const entry = entryByFindingId.get(findingId);
      if (!entry) {
        continue;
      }

      const known = scope.knownExternalIds.get(findingId) ?? null;
      const remoteIssueUid = remoteIssueIdsByFindingId.get(findingId) ?? null;
      const existingIssueUid = known?.issueUid ?? remoteIssueUid;

      if (existingIssueUid) {
        skipped += 1;
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "skipped",
          externalIssueUid: existingIssueUid,
          externalCommentUid: known?.commentUid ?? null,
          hashcode: entry.issueTemplate.string.hashcode,
          locale: entry.issueTemplate.string.localeId,
          message: "provider_comment_already_exists",
        });
        continue;
      }

      try {
        const issue = await client.createIssue(projectId, entry.issueTemplate);
        if (!issue.issueUid) {
          failed += 1;
          failures.push({
            findingId,
            message: "smartling_issue_missing_uid",
          });
          changedItems.push({
            type: "provider_comment",
            findingId,
            status: "failed",
            hashcode: entry.issueTemplate.string.hashcode,
            locale: entry.issueTemplate.string.localeId,
            message: "smartling_issue_missing_uid",
          });
          continue;
        }

        posted += 1;
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "posted",
          externalIssueUid: issue.issueUid,
          externalCommentUid: null,
          hashcode: entry.issueTemplate.string.hashcode,
          locale: entry.issueTemplate.string.localeId,
        });
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "smartling_provider_comment_create_failed";
        failures.push({ findingId, message });
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "failed",
          hashcode: entry.issueTemplate.string.hashcode,
          locale: entry.issueTemplate.string.localeId,
          message,
        });
      }
    }

    return {
      posted,
      skipped,
      failed,
      changedItems,
      failures,
    };
  }

  /** Live glossary matching against synced Smartling glossaries using Smartling glossary search. */
  async searchGlossaryMatches(input: ExternalTmsGlossaryMatcherInput) {
    const authBaseUrl = input.credential.baseUrl ?? undefined;
    const accountUid = await this.resolveAccountUid({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl,
    });
    if (!accountUid) {
      return [];
    }

    const searchableGlossaries = input.glossaries.filter((glossary) => glossary.externalGlossaryId);
    if (searchableGlossaries.length === 0) {
      return [];
    }

    const client = new SmartlingApiClient({ credentials: input.secretMaterial, authBaseUrl });
    const normalizedTargetLocale = input.targetLocale.trim();
    const liveMatches = [];

    for (const glossary of searchableGlossaries) {
      const glossaryUid = glossary.externalGlossaryId;
      if (!glossaryUid) {
        continue;
      }

      if (
        glossary.targetLocale?.trim() &&
        glossary.targetLocale.trim() !== normalizedTargetLocale
      ) {
        continue;
      }

      let entries;
      try {
        entries = await client.searchGlossaryEntries({
          accountUid,
          glossaryUid,
          query: input.sourceText,
        });
      } catch (error) {
        if (error instanceof SmartlingApiError && error.status === 401) {
          throw new Error("smartling_auth_invalid");
        }
        continue;
      }

      for (const [index, entry] of entries.entries()) {
        if (!matchesSmartlingGlossaryEntry(input.sourceText, entry)) {
          continue;
        }

        const sourceTerm = entry.term.trim();
        const targetTerm = pickSmartlingGlossaryTranslation(entry, normalizedTargetLocale);
        if (!sourceTerm || !targetTerm) {
          continue;
        }

        liveMatches.push(
          normalizeProviderGlossaryMatch({
            sourceTerm,
            targetTerm,
            sourceLocale: input.sourceLocale,
            targetLocale: normalizedTargetLocale,
            description: entry.definition,
            providerKind: "smartling",
            resourceId: glossary.id,
            externalResourceId: glossaryUid,
            externalTermId: entry.entryUid,
            glossaryName: glossary.name,
            rank: Math.max(0, 1 - index * 0.01),
          }),
        );
      }
    }

    return liveMatches.toSorted((left, right) => right.rank - left.rank).slice(0, input.limit);
  }

  /** Live TM matching using fuzzy text scoring over Smartling translation memory entries. */
  async searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    const externalMemoryId = input.memory.externalMemoryId?.trim();
    if (!externalMemoryId) {
      return [];
    }

    const accountUid = await this.resolveAccountUid({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      project: input.project ?? undefined,
    });
    if (!accountUid) {
      return [];
    }

    const client = new SmartlingApiClient({ credentials: input.secretMaterial });

    let entries;
    try {
      let fetchedSegmentCount = 0;

      entries = await client.listTranslationMemoryEntries(accountUid, externalMemoryId, {
        sourceLocaleId: input.sourceLocale,
        targetLocaleIds: [input.targetLocale],
        shouldStop: (page) => {
          fetchedSegmentCount += page.length;
          return fetchedSegmentCount >= SMARTLING_TM_SYNC_MAX_ENTRIES;
        },
      });
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      return [];
    }

    const candidates = buildSmartlingTranslationMemoryCandidates(entries, {
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
      limit: input.limit,
    });

    return candidates.map((candidate, index) =>
      normalizeProviderTranslationMemoryMatch({
        sourceText: candidate.sourceText,
        targetText: candidate.targetText,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        matchScore: candidate.matchScore,
        providerKind: "smartling",
        resourceId: input.memory.id,
        externalResourceId: externalMemoryId,
        externalSegmentId: candidate.entryUid,
        memoryName: input.memory.name,
        rank: Math.max(0, 1 - index * 0.01),
      }),
    );
  }

  /** Builds a paginated live CAT queue file for Smartling file or key resources. */
  async buildLiveCatFile(input: {
    secretMaterial: string;
    authBaseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    canEditTranslations: boolean;
    pagination?: ProjectFileCatPaginationInput;
  }): Promise<ProjectFileCatQueueFile> {
    const scope = resolveSmartlingLiveCatContext({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl: input.authBaseUrl,
    });
    const resourceScope = resolveSmartlingResourceScope(input.file);

    const paginationInput = input.pagination ?? {
      offset: 0,
      limit: legacyProviderCatSegmentLimit,
      search: undefined,
      queueFilter: "all",
      paginated: false,
    };

    let loaded;
    try {
      loaded = await loadSmartlingQueueSegments({
        scope,
        file: input.file,
        resourceScope,
        paginationInput,
      });
    } catch (error) {
      mapSmartlingLiveCatApiError(error);
    }

    const pagination = paginationInput.paginated
      ? buildCatFilePagination({
          offset: paginationInput.offset,
          limit: paginationInput.limit,
          returnedCount: loaded.segments.length,
          totalCount: loaded.hasMore
            ? paginationInput.offset + loaded.segments.length + 1
            : paginationInput.offset + loaded.segments.length,
          hasMore: loaded.hasMore,
        })
      : undefined;

    return {
      sourcePath: input.file.sourcePath,
      filename: input.file.filename,
      provider: input.file.provider,
      targetLocale: input.targetLocale,
      canEditTranslations: input.canEditTranslations,
      truncated: loaded.hasMore,
      pagination,
      segments: loaded.segments,
    };
  }

  /** Loads the current target translation for one CAT segment, or `"not_found"`. */
  async getLiveCatSegmentTarget(input: {
    secretMaterial: string;
    authBaseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
  }) {
    const scope = resolveSmartlingLiveCatContext({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl: input.authBaseUrl,
    });
    const resourceScope = resolveSmartlingResourceScope(input.file);
    const hashcode = input.externalStringId.trim();
    if (!hashcode) {
      return "not_found";
    }

    let translations: SmartlingLocaleTranslation[];
    try {
      translations = await scope.client.listLocaleTranslations(
        scope.projectId,
        input.targetLocale,
        resourceScope.fileUri ? { fileUri: resourceScope.fileUri } : undefined,
      );
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 404) {
        return "not_found";
      }
      mapSmartlingLiveCatApiError(error);
    }

    const target = translations.find((translation) => translation.hashcode === hashcode) ?? null;
    if (!target) {
      return null;
    }

    return mapSmartlingTargetTranslation(target);
  }

  /** Lists Smartling issues for one CAT segment in the target locale. */
  async getLiveCatSegmentComments(input: {
    secretMaterial: string;
    authBaseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
  }) {
    const scope = resolveSmartlingLiveCatContext({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl: input.authBaseUrl,
    });
    const hashcode = input.externalStringId.trim();
    if (!hashcode) {
      return [];
    }

    let issues: SmartlingIssue[];
    try {
      issues = await scope.client.listIssues(scope.projectId, {
        stringFilter: {
          hashcodes: [hashcode],
          localeIds: [input.targetLocale],
        },
      });
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 404) {
        return [];
      }
      mapSmartlingLiveCatApiError(error);
    }

    return issues.map(mapSmartlingIssueToComment);
  }

  /** Saves an approved target translation for one CAT segment via Smartling upsert API. */
  async saveLiveCatTranslation(input: {
    secretMaterial: string;
    authBaseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
    text: string;
  }) {
    const scope = resolveSmartlingLiveCatContext({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl: input.authBaseUrl,
    });
    const hashcode = input.externalStringId.trim();
    if (!hashcode) {
      throw new SmartlingLiveCatError(
        "invalid_smartling_string_id",
        "Smartling string identifier is invalid.",
      );
    }

    try {
      await scope.client.upsertLocaleTranslations(scope.projectId, input.targetLocale, [
        {
          hashcode,
          translation: input.text,
        },
      ]);
    } catch (error) {
      mapSmartlingLiveCatApiError(error);
    }

    return {
      text: input.text,
      externalTranslationId: hashcode,
      isApproved: false,
    };
  }

  /** Creates a Smartling issue from the live CAT editor. */
  async saveLiveCatComment(input: {
    secretMaterial: string;
    authBaseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
    text: string;
    type?: "comment" | "issue";
    issueType?: string;
  }) {
    const scope = resolveSmartlingLiveCatContext({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl: input.authBaseUrl,
    });
    const hashcode = input.externalStringId.trim();
    if (!hashcode) {
      throw new SmartlingLiveCatError(
        "invalid_smartling_string_id",
        "Smartling string identifier is invalid.",
      );
    }

    const commentType = input.type ?? "comment";

    let created: SmartlingIssue;
    try {
      created = await scope.client.createIssue(scope.projectId, {
        string: {
          hashcode,
          localeId: input.targetLocale,
        },
        issueTypeCode:
          commentType === "issue" ? input.issueType?.trim().toUpperCase() || "REVIEW" : "REVIEW",
        issueText: input.text,
        issueSeverityLevelCode: mapProviderSeverityToSmartling("warning"),
      });
    } catch (error) {
      mapSmartlingLiveCatApiError(error);
    }

    return mapSmartlingIssueToComment(created);
  }

  /** Closes a Smartling issue from the live CAT editor. */
  async resolveLiveCatComment(input: {
    secretMaterial: string;
    authBaseUrl?: string | null;
    externalProjectId: string;
    externalCommentId: string;
  }) {
    const scope = resolveSmartlingLiveCatContext({
      secretMaterial: input.secretMaterial,
      externalProjectId: input.externalProjectId,
      authBaseUrl: input.authBaseUrl,
    });
    const issueUid = input.externalCommentId.trim();
    if (!issueUid) {
      throw new SmartlingLiveCatError(
        "invalid_smartling_comment_id",
        "Smartling issue identifier is invalid.",
      );
    }

    let closed: SmartlingIssue;
    try {
      closed = await scope.client.closeIssue(scope.projectId, issueUid);
    } catch (error) {
      mapSmartlingLiveCatApiError(error);
    }

    return mapSmartlingIssueToComment(closed);
  }

  /**
   * Loads screenshot visual context bindings for a Smartling source string hashcode.
   *
   * Downloads image context assets and maps coordinate bindings to percent-based CAT markers.
   */
  async loadCatVisualContext(input: {
    client: SmartlingApiClient;
    externalProjectId: string;
    externalStringId: string;
  }): Promise<CatVisualContext> {
    const hashcode = input.externalStringId.trim();
    if (!hashcode) {
      return { screenshots: [] };
    }

    const { items: bindings } = await input.client.listContextBindings(input.externalProjectId, {
      stringHashcodes: [hashcode],
    });
    const matchingBindings = bindings.filter((binding) => binding.stringHashcode === hashcode);
    if (matchingBindings.length === 0) {
      return { screenshots: [] };
    }

    const bindingsByContext = groupBindingsByContext(matchingBindings);
    const screenshots: CatVisualContextScreenshot[] = [];

    for (const [contextUid, contextBindings] of bindingsByContext) {
      if (screenshots.length >= MAX_SMARTLING_SCREENSHOTS_PER_SEGMENT) {
        break;
      }

      let contextInfo;
      try {
        contextInfo = await input.client.getContextInfo(input.externalProjectId, contextUid);
      } catch {
        continue;
      }

      if (contextInfo.contextType !== "IMAGE") {
        continue;
      }

      let content;
      try {
        content = await input.client.downloadContextContent(input.externalProjectId, contextUid);
      } catch {
        continue;
      }

      const dimensions = readImageDimensions(content.bytes);
      const markers = contextBindings
        .map((binding) => mapBindingMarker(binding, dimensions))
        .filter((marker): marker is NonNullable<typeof marker> => marker != null);

      screenshots.push({
        id: contextUid,
        name: contextInfo.name,
        imageUrl: toDataUrl(content.bytes, content.contentType),
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        markers,
      });
    }

    return { screenshots };
  }

  /** Computes aggregated locale readiness across all project files for dashboard-style summaries. */
  async loadProjectLocaleReadiness(input: {
    client: SmartlingApiClient;
    projectId: string;
    languageId?: string;
  }) {
    const files = await input.client.listProjectFiles(input.projectId);
    const localeReadiness: Record<string, unknown> = {};

    const fileReadinessResults = await mapWithConcurrency(files, 5, async (file) => {
      try {
        const statuses = await input.client.getFileStatusForAllLocales(
          input.projectId,
          file.fileUri,
        );
        return mapSmartlingFileLocaleStatusToReadiness(statuses);
      } catch {
        return {} as Record<string, unknown>;
      }
    });

    for (const fileReadiness of fileReadinessResults) {
      for (const [localeId, value] of Object.entries(fileReadiness)) {
        if (input.languageId && localeId !== input.languageId) {
          continue;
        }

        const existing = localeReadiness[localeId];
        if (existing && typeof existing === "object" && !Array.isArray(existing)) {
          const record = existing as Record<string, unknown>;
          const next = value as Record<string, unknown>;
          localeReadiness[localeId] = {
            completedStringCount:
              Number(record.completedStringCount ?? 0) + Number(next.completedStringCount ?? 0),
            authorizedStringCount:
              Number(record.authorizedStringCount ?? 0) + Number(next.authorizedStringCount ?? 0),
            lastCompleted: next.lastCompleted ?? record.lastCompleted ?? null,
            lastAuthorized: next.lastAuthorized ?? record.lastAuthorized ?? null,
          };
        } else {
          localeReadiness[localeId] = value;
        }
      }
    }

    return localeReadiness;
  }
}

/** Shared Smartling TMS provider instance registered in the provider registry. */
export const smartlingTmsProvider = new SmartlingTmsProvider();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalProcessState(status: {
  processState?: string | null;
  processStatus?: string | null;
}) {
  const state = `${status.processState ?? status.processStatus ?? ""}`.toLowerCase();
  if (!state) {
    return false;
  }
  return ["completed", "complete", "finished", "success", "succeeded", "failed", "cancelled"].some(
    (terminal) => state.includes(terminal),
  );
}

function isFailedProcessState(status: {
  processState?: string | null;
  processStatus?: string | null;
}) {
  const state = `${status.processState ?? status.processStatus ?? ""}`.toLowerCase();
  return state.includes("fail") || state.includes("cancel");
}

async function mapInBatches<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const batchSize = Math.max(1, concurrency);

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item) => mapper(item)));
    results.push(...batchResults);
  }

  return results;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function readMetadataAccountUid(metadata: Record<string, unknown> | null | undefined) {
  const accountUid = metadata?.accountUid;
  return typeof accountUid === "string" && accountUid.trim() ? accountUid.trim() : null;
}

function normalizeSmartlingProject(
  project: {
    accountUid: string;
    projectId: string;
    projectName: string;
    sourceLocaleId: string;
    archived: boolean;
    projectTypeCode: string | null;
    targetLocales: Array<{ localeId: string; enabled?: boolean }>;
  },
  extras?: { syncWarning?: string },
) {
  const targetLocales = project.targetLocales
    .filter((locale) => locale.enabled !== false)
    .map((locale) => locale.localeId);

  return {
    externalProjectId: project.projectId,
    name: project.projectName,
    sourceLocale: project.sourceLocaleId,
    targetLocales,
    externalProjectUrl: buildSmartlingProjectUrl(project.accountUid, project.projectId),
    isActive: !project.archived,
    metadata: {
      accountUid: project.accountUid,
      projectTypeCode: project.projectTypeCode,
      ...(extras?.syncWarning ? { syncWarning: extras.syncWarning } : {}),
    },
  };
}

function buildSmartlingProjectUrl(accountUid: string, projectId: string) {
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/dashboard`;
}

function buildSmartlingFileUrl(accountUid: string, projectId: string, fileUri: string) {
  const params = new URLSearchParams({ fileUri });
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/files?${params.toString()}`;
}

function buildSmartlingJobUrl(accountUid: string, projectId: string, translationJobUid: string) {
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(translationJobUid)}`;
}

function displayNameOf(fileUri: string) {
  return fileUri.split("/").filter(Boolean).at(-1) ?? fileUri;
}

function mapSmartlingJobKind(jobStatus: string): "translation" | "review" {
  const normalized = jobStatus.toLowerCase().trim();
  if (
    ["in_review", "in-review", "in review", "in_edit", "in-edit", "in edit"].includes(normalized)
  ) {
    return "review";
  }
  return "translation";
}

async function loadSmartlingJobProgress(
  client: SmartlingApiClient,
  projectId: string,
  jobUid: string,
): Promise<Record<string, unknown>> {
  try {
    const progress = await client.getJobProgress(projectId, jobUid);
    return {
      job: {
        totalWordCount: progress.totalWordCount ?? null,
        completedWordCount: progress.completedWordCount ?? null,
        percentComplete: progress.percentComplete ?? null,
      },
    };
  } catch {
    return {};
  }
}

function countTranslationMemoryEntries(input: {
  targetLocales: string[];
  segments: Array<{
    sourceText: string;
    translations: Array<{ targetLocaleId: string; translationText: string }>;
  }>;
}) {
  let count = 0;

  for (const segment of input.segments) {
    const sourceText = segment.sourceText.trim();
    if (!sourceText) {
      continue;
    }

    for (const targetLocale of input.targetLocales) {
      const targetTranslation = segment.translations.find(
        (translation) =>
          translation.targetLocaleId === targetLocale && translation.translationText.trim(),
      );
      if (targetTranslation) {
        count += 1;
      }
    }
  }

  return count;
}

function buildTranslationMemoryEntries(input: {
  translationMemoryUid: string;
  sourceLanguageId: string;
  targetLocales: string[];
  segments: Array<{
    entryUid: string;
    sourceText: string;
    sourceLocaleId: string;
    translations: Array<{ targetLocaleId: string; translationText: string }>;
  }>;
}) {
  const entries: Array<{
    externalKey: string;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    targetText: string;
    matchScore: number;
    metadata: Record<string, unknown>;
  }> = [];

  for (const segment of input.segments) {
    const sourceText = segment.sourceText.trim();
    if (!sourceText) {
      continue;
    }

    for (const targetLocale of input.targetLocales) {
      const targetTranslation = segment.translations.find(
        (translation) =>
          translation.targetLocaleId === targetLocale && translation.translationText.trim(),
      );
      if (!targetTranslation) {
        continue;
      }

      entries.push({
        externalKey: `${input.translationMemoryUid}:${segment.entryUid}:${targetLocale}`,
        sourceLocale: input.sourceLanguageId,
        targetLocale,
        sourceText,
        targetText: targetTranslation.translationText.trim(),
        matchScore: 100,
        metadata: {
          smartlingEntryUid: segment.entryUid,
        },
      });
    }
  }

  return entries;
}

function translationLookupKey(input: {
  hashcode?: string | null;
  fileUri?: string | null;
  stringText?: string | null;
  parsedStringText?: string | null;
}) {
  if (input.hashcode) {
    return input.fileUri ? `${input.fileUri}::${input.hashcode}` : input.hashcode;
  }
  const text = input.parsedStringText ?? input.stringText;
  if (!text) {
    return null;
  }
  return input.fileUri ? `${input.fileUri}::${text}` : text;
}

function isApprovedTranslation(translation: {
  authorized?: boolean | null;
  published?: boolean | null;
  publishStatus?: string | null;
  translation?: string | null;
}) {
  if (!translation.translation?.trim()) {
    return false;
  }
  if (translation.authorized === true || translation.published === true) {
    return true;
  }
  const publishStatus = translation.publishStatus?.toLowerCase() ?? "";
  const approvedStatuses = new Set([
    "published",
    "authorized",
    "approved",
    "completed",
    "complete",
  ]);
  return approvedStatuses.has(publishStatus);
}

function mapIssueState(issueStateCode: string | null | undefined): ProviderReviewThreadState {
  const normalized = issueStateCode?.trim().toUpperCase() ?? "";
  if (normalized === "RESOLVED" || normalized === "CLOSED") {
    return "resolved";
  }
  if (normalized === "OPENED" || normalized === "OPEN") {
    return "open";
  }
  return "unknown";
}

function normalizeSmartlingIssueToThread(input: {
  issue: SmartlingIssue;
  externalProjectId: string;
  externalJobId: string;
  stringKeyById: Map<string, string>;
  projectWebUrl: string | null;
}): ProviderReviewThread {
  const hashcode = input.issue.string?.hashcode?.trim() ?? "";
  const kind: ProviderReviewThreadKind = "issue";
  const externalThreadId = input.issue.issueUid;
  const stringKey = input.stringKeyById.get(hashcode) ?? hashcode;

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "smartling",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind,
      externalThreadId,
    }),
    kind,
    state: mapIssueState(input.issue.issueStateCode),
    subject: input.issue.issueText ?? "",
    issueType: input.issue.issueTypeCode ?? null,
    item: {
      externalStringId: hashcode,
      key: stringKey,
      locale: input.issue.string?.localeId || undefined,
      field: "target",
    },
    locale: input.issue.string?.localeId ?? null,
    comments: [
      {
        externalCommentId: externalThreadId,
        body: input.issue.issueText ?? "",
        createdAt: null,
        updatedAt: null,
      },
    ],
    createdAt: null,
    updatedAt: null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: externalThreadId,
      providerUrl: input.projectWebUrl,
    },
  };
}

/** Maps Hyperlocalise QA severity to Smartling issue severity level codes. */
export function mapProviderSeverityToSmartling(severity: ProviderQaSeverity) {
  switch (severity) {
    case "error":
      return "HIGH";
    case "warning":
      return "MEDIUM";
    case "info":
    default:
      return "LOW";
  }
}

function formatIssueText(finding: ProviderQaFinding, findingId: string) {
  const lines = [
    buildHyperlocaliseFindingMarker(findingId),
    `[${finding.checkType}] ${finding.message}`,
  ];

  if (finding.suggestedFix) {
    lines.push(`Suggested fix: ${finding.suggestedFix}`);
  }

  if (typeof finding.confidence === "number") {
    lines.push(`Confidence: ${finding.confidence}`);
  }

  return lines.join("\n");
}

/** Builds Smartling issue templates from QA findings, including validation failures. */
export function buildSmartlingCommentWriteBackEntries(input: {
  findings: ProviderQaFinding[];
  defaultLocaleId: string | null;
}): {
  entries: SmartlingCommentWriteBackEntry[];
  failures: Array<{ findingId: string; message: string }>;
} {
  const entries: SmartlingCommentWriteBackEntry[] = [];
  const failures: Array<{ findingId: string; message: string }> = [];

  for (const finding of input.findings) {
    const findingId = buildFindingId(finding);
    const hashcode = finding.item.externalStringId.trim();
    const localeId = finding.item.locale?.trim() || input.defaultLocaleId?.trim() || "";

    if (!hashcode) {
      failures.push({
        findingId,
        message: "smartling_comment_missing_hashcode",
      });
      continue;
    }

    if (!localeId) {
      failures.push({
        findingId,
        message: "smartling_comment_missing_locale",
      });
      continue;
    }

    entries.push({
      findingId,
      finding,
      issueTemplate: {
        string: { hashcode, localeId },
        issueTypeCode: "REVIEW",
        issueText: formatIssueText(finding, findingId),
        issueSeverityLevelCode: mapProviderSeverityToSmartling(finding.severity),
      },
    });
  }

  return { entries, failures };
}

/** Returns whether a glossary entry term is a strong enough match for live search. */
export function matchesSmartlingGlossaryEntry(sourceText: string, entry: SmartlingGlossaryEntry) {
  return scoreSmartlingTextMatch(sourceText, entry.term) >= 55;
}

/** Ranks translation memory entries by text similarity for live TM search. */
export function buildSmartlingTranslationMemoryCandidates(
  entries: SmartlingTranslationMemoryEntry[],
  input: {
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    limit: number;
  },
) {
  const candidates: Array<{
    entryUid: string;
    sourceText: string;
    targetText: string;
    matchScore: number;
  }> = [];

  for (const entry of entries) {
    const sourceText = entry.sourceText.trim();
    if (!sourceText) {
      continue;
    }

    const matchScore = scoreSmartlingTextMatch(input.sourceText, sourceText);
    if (matchScore < 55) {
      continue;
    }

    const translation = entry.translations.find(
      (item) => item.targetLocaleId.trim() === input.targetLocale.trim(),
    );
    const targetText = translation?.translationText.trim();
    if (!targetText) {
      continue;
    }

    candidates.push({
      entryUid: entry.entryUid,
      sourceText,
      targetText,
      matchScore,
    });
  }

  return candidates
    .toSorted((left, right) => right.matchScore - left.matchScore)
    .slice(0, input.limit);
}

function mapSmartlingLiveCatApiError(error: unknown): never {
  if (error instanceof SmartlingApiError && error.status === 401) {
    throw new SmartlingLiveCatError("smartling_auth_invalid", "Smartling credentials are invalid.");
  }
  throw error;
}

function resolveSmartlingLiveCatContext(input: {
  secretMaterial: string;
  externalProjectId: string;
  authBaseUrl?: string | null;
}): SmartlingLiveCatContext {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new SmartlingLiveCatError(
      "invalid_smartling_project_id",
      "Smartling project identifier is invalid.",
    );
  }

  const credentials = parseSmartlingCredentials(input.secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: input.authBaseUrl ?? undefined,
  });

  return { client, projectId };
}

function resolveSmartlingResourceScope(file: TmsProviderLiveFile): SmartlingResourceScope {
  const resourceType = file.provider?.resourceType ?? "file";
  const externalResourceId = file.provider?.externalResourceId?.trim() ?? "";

  if (resourceType === "key") {
    const separatorIndex = externalResourceId.indexOf("::");
    if (separatorIndex > 0) {
      return {
        fileUri: externalResourceId.slice(0, separatorIndex),
        hashcode: externalResourceId.slice(separatorIndex + 2) || null,
      };
    }

    const sourcePath = file.sourcePath.trim();
    const keyPrefix = "/keys/";
    const keyIndex = sourcePath.lastIndexOf(keyPrefix);
    if (keyIndex > 0) {
      return {
        fileUri: sourcePath.slice(0, keyIndex),
        hashcode: sourcePath.slice(keyIndex + keyPrefix.length) || externalResourceId || null,
      };
    }

    return { fileUri: null, hashcode: externalResourceId || null };
  }

  return {
    fileUri: externalResourceId || file.sourcePath.trim() || null,
    hashcode: null,
  };
}

function buildQueueSegmentFromSourceString(
  sourceString: SmartlingSourceString,
): SmartlingQueueSegmentDraft {
  const instruction =
    typeof sourceString.metadata?.instruction === "string"
      ? sourceString.metadata.instruction
      : null;

  return {
    externalStringId: sourceString.hashcode,
    key: sourceString.variant?.trim() || sourceString.hashcode,
    sourceText: sourceString.stringText?.trim() || sourceString.hashcode,
    context: instruction,
    type: sourceString.variant ?? null,
  };
}

function draftToQueueSegment(draft: SmartlingQueueSegmentDraft): ProjectFileCatQueueSegment {
  return {
    externalStringId: draft.externalStringId,
    key: draft.key,
    sourceText: draft.sourceText,
    context: draft.context,
    type: draft.type,
  };
}

function segmentMatchesSearch(segment: SmartlingQueueSegmentDraft, search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return (
    segment.key.toLowerCase().includes(query) ||
    segment.sourceText.toLowerCase().includes(query) ||
    (segment.context?.toLowerCase().includes(query) ?? false)
  );
}

function translationIsApproved(translation: SmartlingLocaleTranslation) {
  if (!translation.translation?.trim()) {
    return false;
  }
  if (translation.authorized === true || translation.published === true) {
    return true;
  }
  const publishStatus = translation.publishStatus?.toLowerCase() ?? "";
  return ["published", "authorized", "approved", "completed", "complete"].includes(publishStatus);
}

function mapSmartlingTargetTranslation(
  translation: SmartlingLocaleTranslation | null | undefined,
): ProjectFileCatTranslation | null {
  if (!translation?.translation?.trim()) {
    return null;
  }

  return {
    text: translation.translation,
    externalTranslationId: translation.hashcode ?? null,
    isApproved: translationIsApproved(translation),
  };
}

function mapSmartlingIssueToComment(issue: SmartlingIssue): ProjectFileCatComment {
  const state = issue.issueStateCode?.trim().toUpperCase() ?? "";
  return {
    externalCommentId: issue.issueUid,
    type: "issue",
    status: state === "RESOLVED" || state === "CLOSED" ? "resolved" : "unresolved",
    text: issue.issueText ?? "",
    createdAt: null,
    locale: issue.string?.localeId ?? null,
    author: null,
  };
}

async function loadOpenIssueHashcodes(input: {
  client: SmartlingApiClient;
  projectId: string;
  hashcodes: string[];
}) {
  if (input.hashcodes.length === 0) {
    return new Set<string>();
  }

  const issues = await input.client.listIssues(input.projectId, {
    stringFilter: { hashcodes: input.hashcodes },
    issueStateCodes: ["OPENED"],
  });

  return new Set(
    issues
      .map((issue) => issue.string?.hashcode?.trim())
      .filter((hashcode): hashcode is string => Boolean(hashcode)),
  );
}

async function loadSmartlingQueueSegments(input: {
  scope: SmartlingLiveCatContext;
  file: TmsProviderLiveFile;
  resourceScope: SmartlingResourceScope;
  paginationInput: ProjectFileCatPaginationInput;
}): Promise<{
  segments: ProjectFileCatQueueSegment[];
  hasMore: boolean;
}> {
  const { queueFilter, search, offset, limit } = input.paginationInput;

  if (input.resourceScope.hashcode) {
    const strings = await input.scope.client.listSourceStrings(input.scope.projectId, {
      fileUri: input.resourceScope.fileUri ?? undefined,
    });
    const sourceString =
      strings.find((item) => item.hashcode === input.resourceScope.hashcode) ??
      ({
        hashcode: input.resourceScope.hashcode,
        stringText: input.file.filename,
        fileUri: input.resourceScope.fileUri,
      } satisfies SmartlingSourceString);

    const draft = buildQueueSegmentFromSourceString(sourceString);
    if (!segmentMatchesSearch(draft, search)) {
      return { segments: [], hasMore: false };
    }
    if (queueFilter === "has_issues") {
      const openIssues = await loadOpenIssueHashcodes({
        client: input.scope.client,
        projectId: input.scope.projectId,
        hashcodes: [draft.externalStringId],
      });
      if (!openIssues.has(draft.externalStringId)) {
        return { segments: [], hasMore: false };
      }
    }

    return { segments: [draftToQueueSegment(draft)], hasMore: false };
  }

  if (!input.paginationInput.paginated) {
    const page = await input.scope.client.listSourceStringsPage(input.scope.projectId, {
      fileUri: input.resourceScope.fileUri ?? undefined,
      offset: 0,
      limit: legacyProviderCatSegmentLimit + 1,
    });

    let drafts = page.strings
      .map(buildQueueSegmentFromSourceString)
      .filter((draft) => segmentMatchesSearch(draft, search));

    if (queueFilter === "has_issues") {
      const openIssues = await loadOpenIssueHashcodes({
        client: input.scope.client,
        projectId: input.scope.projectId,
        hashcodes: drafts.map((draft) => draft.externalStringId),
      });
      drafts = drafts.filter((draft) => openIssues.has(draft.externalStringId));
    }

    const truncated = drafts.length > legacyProviderCatSegmentLimit || page.hasMore;
    const visible = truncated ? drafts.slice(0, legacyProviderCatSegmentLimit) : drafts;
    return { segments: visible.map(draftToQueueSegment), hasMore: truncated };
  }

  const page = await input.scope.client.listSourceStringsPage(input.scope.projectId, {
    fileUri: input.resourceScope.fileUri ?? undefined,
    offset,
    limit,
  });

  let drafts = page.strings
    .map(buildQueueSegmentFromSourceString)
    .filter((draft) => segmentMatchesSearch(draft, search));

  if (queueFilter === "has_issues") {
    const openIssues = await loadOpenIssueHashcodes({
      client: input.scope.client,
      projectId: input.scope.projectId,
      hashcodes: drafts.map((draft) => draft.externalStringId),
    });
    drafts = drafts.filter((draft) => openIssues.has(draft.externalStringId));
  }

  return {
    segments: drafts.map(draftToQueueSegment),
    hasMore: page.hasMore,
  };
}

function mapSmartlingFileLocaleStatusToReadiness(
  statuses: SmartlingFileLocaleStatus[],
): Record<string, unknown> {
  const localeReadiness: Record<string, unknown> = {};

  for (const status of statuses) {
    const existing = localeReadiness[status.localeId];
    const completed = status.completedStringCount ?? 0;
    const authorized = status.authorizedStringCount ?? 0;

    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      const record = existing as Record<string, unknown>;
      localeReadiness[status.localeId] = {
        completedStringCount: Number(record.completedStringCount ?? 0) + completed,
        authorizedStringCount: Number(record.authorizedStringCount ?? 0) + authorized,
        lastCompleted: status.lastCompleted ?? record.lastCompleted ?? null,
        lastAuthorized: status.lastAuthorized ?? record.lastAuthorized ?? null,
      };
      continue;
    }

    localeReadiness[status.localeId] = {
      completedStringCount: completed,
      authorizedStringCount: authorized,
      lastCompleted: status.lastCompleted ?? null,
      lastAuthorized: status.lastAuthorized ?? null,
    };
  }

  return localeReadiness;
}

function groupBindingsByContext(bindings: SmartlingContextBinding[]) {
  const grouped = new Map<string, SmartlingContextBinding[]>();
  for (const binding of bindings) {
    const existing = grouped.get(binding.contextUid) ?? [];
    existing.push(binding);
    grouped.set(binding.contextUid, existing);
  }
  return grouped;
}

function mapBindingMarker(
  binding: SmartlingContextBinding,
  dimensions: { width: number; height: number } | null,
) {
  const coordinates = binding.coordinates;
  if (!coordinates || coordinates.width <= 0 || coordinates.height <= 0) {
    return null;
  }

  if (dimensions) {
    return pixelRectToPercentMarkers({
      width: dimensions.width,
      height: dimensions.height,
      left: coordinates.left,
      top: coordinates.top,
      widthPx: coordinates.width,
      heightPx: coordinates.height,
    });
  }

  return null;
}

export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }

  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return readJpegDimensions(bytes);
  }

  return null;
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (segmentLength < 2) {
      return null;
    }

    const isStartOfFrame =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isStartOfFrame && offset + 7 < bytes.length) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }

    offset += segmentLength + 2;
  }

  return null;
}

function toDataUrl(bytes: Uint8Array, contentType: string) {
  const normalizedType = contentType.trim() || "image/png";
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${normalizedType};base64,${base64}`;
}
