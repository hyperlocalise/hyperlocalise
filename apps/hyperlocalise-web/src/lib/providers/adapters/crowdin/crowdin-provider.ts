import { createHash } from "node:crypto";

import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type {
  ProviderReviewAuthor,
  ProviderReviewThread,
  ProviderReviewThreadKind,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";
import {
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import {
  CrowdinApiClient,
  CrowdinApiError,
  escapeCrowdinCroqlString,
  type CrowdinBranch,
  type CrowdinCreateTaskRequest,
  type CrowdinDirectory,
  type CrowdinFile,
  type CrowdinProject,
  type CrowdinShortUser,
  type CrowdinSourceString,
  type CrowdinStringComment,
  type CrowdinTask,
  type CrowdinTaskComment,
  type CrowdinTaskDetails,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import {
  TmsProvider,
  type TmsProviderCommentPushScope,
  type TmsProviderContext,
  type TmsProviderCreateJobTaskScope,
  type TmsProviderCommentPushResult,
  type TmsProviderFeature,
  type TmsProviderFeatureId,
  type TmsProviderJobScope,
  type TmsProviderProjectScope,
  type TmsProviderPullReviewScope,
  type TmsProviderPushTranslationsScope,
  type TmsProviderSourceFileUploadScope,
} from "@/lib/providers/contracts/tms-provider";
import type { ExternalTmsGlossaryMatcherInput } from "@/lib/providers/contracts/glossary-matcher";
import { normalizeProviderGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import type {
  ExternalTmsJobTaskMetadata,
  ExternalTmsProjectMetadata,
} from "@/lib/providers/jobs/tms-provider-types";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live-error";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";
import {
  pixelRectToPercentMarkers,
  type CatVisualContext,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

export {
  CROWDIN_OAUTH_SCOPE_GUIDE,
  CROWDIN_OAUTH_SCOPES,
  getCrowdinOAuthScopeString,
  type CrowdinOAuthScopeGuideEntry,
} from "@/lib/providers/adapters/crowdin/crowdin-oauth-scopes";

/**
 * Crowdin TMS provider adapter.
 *
 * Implements {@link TmsProvider} against the Crowdin REST API v2. Workspace credentials
 * store OAuth app configuration; user-scoped actions resolve per-user OAuth tokens through
 * {@link crowdinAuth} and {@link resolveExternalTmsSecretMaterialForActor}.
 *
 * Crowdin maps Hyperlocalise "jobs" to Crowdin **tasks**. Source content is modeled as
 * **strings** (not keys). Files live under branches and directories.
 *
 * Notable behaviors:
 * - Task content pull tries `taskId`, then `stringIds`, then `fileIds` fallbacks.
 * - QA findings are written back as Crowdin string **issues** tagged with
 *   `[hyperlocalise:finding=…]` markers for idempotent deduplication.
 * - {@link CrowdinTmsProvider.checkProgress} supports project-, file-, and string-level
 *   translation/approval progress for agent workflows.
 * - Live CAT helpers ({@link CrowdinTmsProvider.searchCatConcordance},
 *   {@link CrowdinTmsProvider.loadCatVisualContext}) power in-app concordance and screenshots.
 */

const implemented = { state: "implemented" } as const satisfies TmsProviderFeature;
const logger = createLogger("crowdin-provider");
const CROWDIN_GLOSSARY_FETCH_CONCURRENCY = 5;
const CROWDIN_TM_FETCH_CONCURRENCY = 5;
const MAX_SEGMENTS_PER_MEMORY = 2_000;
const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i;
const HYPERLOCALISE_FINDING_MARKER_PREFIX = "[hyperlocalise:finding=";
const MAX_CROWDIN_SCREENSHOTS_PER_SEGMENT = 8;

/** Granularity at which {@link CrowdinTmsProvider.checkProgress} reports translation status. */
export type CrowdinProgressScope = "project" | "file" | "string";

/** Input for agent-facing Crowdin progress checks. */
export type CheckCrowdinProgressInput = {
  organizationId: string;
  projectId: string;
  actorUserId?: string | null;
  scope: CrowdinProgressScope;
  languageIds?: string[];
  filePath?: string;
  fileId?: number;
  stringIdentifier?: string;
  stringId?: number;
  targetLocale?: string;
};

/** Per-language translation and approval counters returned by progress checks. */
export type CrowdinProgressLanguageSummary = {
  languageId: string;
  translationProgress: number;
  approvalProgress: number;
  words: { total: number; translated: number; approved: number };
  phrases: { total: number; translated: number; approved: number };
};

/** Successful Crowdin progress payload returned by {@link CrowdinTmsProvider.checkProgress}. */
export type CheckCrowdinProgressResult = {
  scope: CrowdinProgressScope;
  crowdinProjectId: number;
  crowdinProjectName: string;
  resource?: {
    type: "file" | "string";
    id: number;
    path?: string;
    identifier?: string;
    text?: string;
  };
  languages: CrowdinProgressLanguageSummary[];
  stringTranslations?: Array<{
    languageId: string;
    translated: boolean;
    approved: boolean;
    text: string | null;
  }>;
};

type CrowdinProgressError =
  | { code: "crowdin_not_configured"; message: string }
  | { code: "crowdin_resource_not_found"; message: string }
  | { code: "crowdin_invalid_input"; message: string }
  | { code: "crowdin_api_error"; message: string };

const CROWDIN_USER_CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  crowdin_user_connection_required:
    "Connect your Crowdin account before checking Crowdin progress.",
  crowdin_user_connection_auth_mode_mismatch:
    "Reconnect your Crowdin account after the workspace authentication mode changed.",
};

/**
 * Crowdin implementation of the shared TMS provider contract.
 *
 * Use the exported singleton {@link crowdinTmsProvider} in production code.
 */
export class CrowdinTmsProvider extends TmsProvider {
  readonly kind = "crowdin" as const;
  readonly label = "Crowdin";

  readonly auth = {
    workspaceCredential: true,
    userConnection: true,
    note: "Workspace credentials store OAuth app configuration; user-facing actions use per-user Crowdin OAuth tokens.",
  };

  readonly resourceSupport = {
    providerCat: {
      file: true,
      key: false,
    },
  };

  readonly features = {
    "projects.read": implemented,
    "projects.write": implemented,
    "locales.read": implemented,
    "locales.write": implemented,
    "files.upload": implemented,
    "files.download": implemented,
    "keys.read": implemented,
    "keys.write": implemented,
    "jobs.create": implemented,
    "jobs.read": implemented,
    "tasks.create": implemented,
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
    "cat.open": implemented,
    "cat.visual_context": implemented,
    "auth.user_scoped": implemented,
  } satisfies Record<TmsProviderFeatureId, TmsProviderFeature>;

  /** Builds an authenticated {@link CrowdinApiClient} from provider scope credentials. */
  private createClient(input: {
    credential: { baseUrl?: string | null };
    secretMaterial: string;
    fetchFn?: typeof fetch;
  }) {
    return new CrowdinApiClient({
      token: input.secretMaterial,
      baseUrl: input.credential.baseUrl ?? undefined,
      fetchFn: input.fetchFn,
    });
  }

  /** Lists Crowdin projects visible to the connected account and maps them to workspace metadata. */
  async fetchProjects(context: TmsProviderContext) {
    const client = this.createClient(context);

    let projects: CrowdinProject[];
    try {
      projects = await client.listProjects();
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    return projects.map((project) => this.mapProjectToMetadata(project));
  }

  /**
   * Discovers source files in a Crowdin project, optionally scoped to a branch.
   *
   * Resolves branch/directory paths into Hyperlocalise `sourcePath` values and returns
   * file-level external resource metadata (Crowdin has no first-class "key" CAT resource).
   */
  async fetchFileKeys(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);
    const webOrigin = this.webOrigin(scope.credential.baseUrl);
    const projectId = this.parseProjectId(scope.externalProjectId);
    const branches = await this.listBranches(client, projectId);
    const branchMap = this.buildBranchMap(branches);
    const directoryPathById = new Map<number, string>();
    const allFiles: CrowdinFile[] = [];
    const trimmedBranchFilter = scope.branch?.trim() ?? "";

    if (trimmedBranchFilter) {
      const targetBranch = branches.find((branch) => branch.name === trimmedBranchFilter);
      if (!targetBranch) {
        return [];
      }

      const directories = await this.listDirectories(client, projectId, targetBranch.id);
      this.buildDirectoryPaths(directories, directoryPathById);
      allFiles.push(...(await this.listFiles(client, projectId, targetBranch.id)));
    } else {
      const rootDirectories = await this.listDirectories(client, projectId);
      this.buildDirectoryPaths(rootDirectories, directoryPathById);

      for (const branch of branches) {
        const directories = await this.listDirectories(client, projectId, branch.id);
        this.buildDirectoryPaths(directories, directoryPathById);
        allFiles.push(...(await this.listFiles(client, projectId, branch.id)));
      }

      const rootFiles = await this.listFiles(client, projectId);
      allFiles.push(...rootFiles.filter((file) => file.branchId === null));
    }

    return allFiles.map((file) => {
      const sourcePath = this.sourcePathOf(file, branchMap, directoryPathById);

      return {
        externalResourceId: String(file.id),
        resourceType: "file" as const,
        sourcePath,
        displayName: file.title ?? file.name,
        format: file.type,
        revision: String(file.revisionId),
        externalUrl: `${webOrigin}/project/${projectId}/files/${file.id}`,
        syncState: file.status === "active" ? "synced" : "pending",
        providerPayload: {
          branchId: file.branchId,
          directoryId: file.directoryId,
          name: file.name,
          path: file.path,
          status: file.status,
          revisionId: file.revisionId,
        },
      };
    });
  }

  /**
   * Lists Crowdin tasks for a project and maps each to {@link ExternalTmsJobTaskMetadata}.
   *
   * When `scope.includeLocaleProgress` is true, attaches best-effort locale readiness from
   * project language progress endpoints.
   */
  async fetchJobTasks(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);
    const projectId = this.parseProjectId(scope.externalProjectId);

    let tasks: Awaited<ReturnType<CrowdinApiClient["listTasks"]>>;
    try {
      tasks = await client.listTasks(projectId, {
        fetchAll: scope.fetchAllTasks ?? false,
      });
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const localeReadiness = scope.includeLocaleProgress
      ? await this.loadLocaleReadiness(client, projectId)
      : {};

    return tasks.map((task) => this.mapTaskToJobTaskMetadata(task, localeReadiness));
  }

  /**
   * Creates a Crowdin translation or proofreading task from file, string, or branch ids.
   *
   * Crowdin accepts exactly one source scope per request (`fileIds`, `stringIds`, or `branchIds`).
   * Hyperlocalise keeps ids as strings at integration boundaries, so this method validates and
   * converts them before sending the API request.
   */
  async createJobTask(scope: TmsProviderCreateJobTaskScope) {
    const client = this.createClient(scope);
    const projectId = this.parseProjectId(scope.externalProjectId);
    const request = this.buildCreateTaskRequest(scope.task);

    let created: CrowdinTaskDetails;
    try {
      created = await client.addTask(projectId, request);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    return this.mapTaskToJobTaskMetadata(created, {});
  }

  /**
   * Imports glossaries linked to the Crowdin project, including term rows per target locale.
   *
   * Glossaries are filtered to those explicitly linked via `projectIds` or `defaultProjectIds`.
   * Term fetch failures produce sync rows with `syncErrorMessage` instead of failing the batch.
   */
  async fetchGlossaries(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);
    const crowdinProjectId = this.parseProjectId(scope.externalProjectId);

    let glossaries: Awaited<ReturnType<CrowdinApiClient["listGlossaries"]>>;
    try {
      glossaries = await client.listGlossaries();
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale ?? "en";
    const targetLocales = scope.project.targetLocales ?? [];
    const scoped = glossaries.filter((glossary) =>
      this.isResourceLinkedToProject({
        projectId: crowdinProjectId,
        projectIds: glossary.projectIds,
        defaultProjectIds: glossary.defaultProjectIds,
      }),
    );

    const results = await mapWithConcurrency(
      scoped,
      CROWDIN_GLOSSARY_FETCH_CONCURRENCY,
      async (glossary) => {
        try {
          const terms = await client.listGlossaryTerms(glossary.id);
          const glossaryTargetLocales = this.uniqueLocales([
            ...targetLocales,
            ...glossary.languageIds.filter((locale) => locale !== glossary.languageId),
          ]);

          const termRows = this.buildGlossaryTermRows({
            glossaryId: glossary.id,
            sourceLanguageId: glossary.languageId,
            terms,
            targetLocales:
              glossaryTargetLocales.length > 0 ? glossaryTargetLocales : [sourceLocale],
          });

          return glossaryTargetLocales.map((targetLocale) => ({
            externalGlossaryId: String(glossary.id),
            name: glossary.name,
            description: glossary.description ?? "",
            sourceLocale: glossary.languageId,
            targetLocale,
            localeCoverage: this.uniqueLocales([glossary.languageId, ...glossary.languageIds]),
            termCount: glossary.terms,
            externalUrl: glossary.webUrl,
            metadata: {
              crowdinGlossaryId: glossary.id,
              crowdinProjectId,
            },
            terms: termRows
              .filter((term) => term.targetLocale === targetLocale)
              .map((term) => ({
                externalKey: term.externalKey,
                sourceTerm: term.sourceTerm,
                targetTerm: term.targetTerm,
                description: term.description,
                partOfSpeech: term.partOfSpeech,
                status: term.status,
                forbidden: term.forbidden,
                notes: term.notes,
                metadata: term.metadata,
              })),
          }));
        } catch (error) {
          this.rethrowAuthError(error);

          return [
            {
              externalGlossaryId: String(glossary.id),
              name: glossary.name,
              description: glossary.description ?? "",
              sourceLocale: glossary.languageId,
              targetLocale: targetLocales[0] ?? glossary.languageIds[0] ?? sourceLocale,
              localeCoverage: this.uniqueLocales([glossary.languageId, ...glossary.languageIds]),
              termCount: glossary.terms,
              externalUrl: glossary.webUrl,
              syncErrorMessage:
                error instanceof Error ? error.message : "glossary_term_fetch_failed",
              metadata: {
                crowdinGlossaryId: glossary.id,
                crowdinProjectId,
              },
              terms: [],
            },
          ];
        }
      },
    );

    return results.flat();
  }

  /**
   * Imports translation memory segments linked to the Crowdin project.
   *
   * Segment import is capped at {@link MAX_SEGMENTS_PER_MEMORY} per memory. Memories not
   * linked to the project are skipped.
   */
  async fetchTranslationMemories(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);
    const crowdinProjectId = this.parseProjectId(scope.externalProjectId);

    let memories: Awaited<ReturnType<CrowdinApiClient["listTranslationMemories"]>>;
    try {
      memories = await client.listTranslationMemories();
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale ?? "en";
    const targetLocales = scope.project.targetLocales ?? [];
    const scoped = memories.filter((memory) =>
      this.isResourceLinkedToProject({
        projectId: crowdinProjectId,
        projectIds: memory.projectIds,
        defaultProjectIds: memory.defaultProjectIds,
      }),
    );

    return mapWithConcurrency(scoped, CROWDIN_TM_FETCH_CONCURRENCY, async (memory) => {
      try {
        const entryTargetLocales = this.uniqueLocales([
          ...targetLocales,
          ...memory.languageIds.filter((locale) => locale !== memory.languageId),
        ]);
        const sourceLanguageId = memory.languageId || sourceLocale;
        const buildEntries = (
          segments: Parameters<CrowdinTmsProvider["buildTranslationMemoryEntries"]>[0]["segments"],
        ) =>
          this.buildTranslationMemoryEntries({
            memoryId: memory.id,
            sourceLanguageId,
            targetLocales: entryTargetLocales,
            segments,
          });

        const segments = await client.listTranslationMemorySegments(memory.id, {
          shouldStop: (fetchedSegments) =>
            buildEntries(fetchedSegments).length >= MAX_SEGMENTS_PER_MEMORY,
        });
        const syncedEntries = buildEntries(segments).slice(0, MAX_SEGMENTS_PER_MEMORY);

        return {
          externalMemoryId: String(memory.id),
          name: memory.name,
          description: memory.description ?? "",
          sourceLocale: memory.languageId || sourceLocale,
          localeCoverage: this.uniqueLocales([memory.languageId, ...memory.languageIds]),
          segmentCount: memory.segmentsCount,
          externalUrl: memory.webUrl,
          metadata: {
            crowdinTranslationMemoryId: memory.id,
            crowdinProjectId,
            importedSegmentCount: syncedEntries.length,
          },
          entries: syncedEntries,
        };
      } catch (error) {
        this.rethrowAuthError(error);

        return {
          externalMemoryId: String(memory.id),
          name: memory.name,
          description: memory.description ?? "",
          sourceLocale: memory.languageId || sourceLocale,
          localeCoverage: this.uniqueLocales([memory.languageId, ...memory.languageIds]),
          segmentCount: memory.segmentsCount,
          externalUrl: memory.webUrl,
          syncErrorMessage:
            error instanceof Error ? error.message : "translation_memory_sync_failed",
          metadata: {
            crowdinTranslationMemoryId: memory.id,
            crowdinProjectId,
          },
          entries: [],
        };
      }
    });
  }

  /**
   * Pulls source strings, target translations, and approval state for a Crowdin task.
   *
   * String resolution order: taskId filter → task.stringIds → task.fileIds. A best-effort
   * task export artifact URL is included when Crowdin exposes one.
   */
  async pullTaskContent(scope: TmsProviderJobScope) {
    const client = this.createClient(scope);
    const projectId = Number(scope.externalProjectId);
    const taskId = Number(scope.externalJobId);
    if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
      throw new Error("invalid_crowdin_project_or_task_id");
    }

    let task: CrowdinTaskDetails;
    try {
      task = await client.getTask(projectId, taskId);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const targetLanguageId = task.targetLanguageId ?? task.languageId;
    if (!targetLanguageId) {
      throw new Error("crowdin_task_missing_target_language");
    }

    const { sourceStrings, pullStrategy, countsByFileId } = await this.resolveTaskSourceStrings(
      client,
      projectId,
      taskId,
      task,
    );

    const approvals = await client.listTranslationApprovalsForSourceStrings(
      projectId,
      targetLanguageId,
      sourceStrings,
    );
    const approvedTranslationIds = new Set(approvals.map((approval) => approval.translationId));
    const translationsByStringId = new Map<
      number,
      Awaited<ReturnType<CrowdinApiClient["listLanguageTranslations"]>>
    >();
    const sourceStringIds = sourceStrings.map((sourceString) => sourceString.id);

    for (const chunk of this.chunkArray(sourceStringIds, 25)) {
      const batch = await client.listLanguageTranslations(projectId, targetLanguageId, {
        stringIds: chunk,
      });

      for (const translation of batch) {
        const existing = translationsByStringId.get(translation.stringId) ?? [];
        existing.push(translation);
        translationsByStringId.set(translation.stringId, existing);
      }
    }

    const units = sourceStrings.map((sourceString) => {
      const translations = translationsByStringId.get(sourceString.id) ?? [];

      return {
        externalStringId: String(sourceString.id),
        key: sourceString.identifier,
        sourceText: this.sourceTextValue(sourceString.text),
        context: sourceString.context,
        fileId: sourceString.fileId ? String(sourceString.fileId) : null,
        translations: translations
          .filter((translation) => translation.text != null)
          .map((translation) => ({
            locale: targetLanguageId,
            text: translation.text as string,
            externalTranslationId:
              translation.translationId != null ? String(translation.translationId) : null,
            isApproved:
              translation.translationId != null &&
              approvedTranslationIds.has(translation.translationId),
          })),
        providerPayload: {
          type: sourceString.type,
          branchId: sourceString.branchId,
          directoryId: sourceString.directoryId,
        },
      };
    });

    logger.info(
      {
        crowdinProjectId: projectId,
        crowdinTaskId: taskId,
        pullStrategy,
        stringCount: sourceStrings.length,
        unitCount: units.length,
        unitsWithSourceText: units.filter((unit) => unit.sourceText.trim().length > 0).length,
        translationCount: units.reduce((total, unit) => total + unit.translations.length, 0),
        ...(countsByFileId ? { countsByFileId } : {}),
      },
      "crowdin task content pull completed",
    );

    let exportArtifact = null;
    try {
      const exportLink = await client.exportTaskStrings(projectId, taskId);
      if (exportLink?.url) {
        const bytes = await client.downloadUrl(exportLink.url);
        exportArtifact = {
          url: exportLink.url,
          byteLength: bytes.byteLength,
        };
      }
    } catch {
      // Task export is best-effort for agent workflows.
    }

    return {
      externalJobId: String(task.id),
      externalTaskId: null,
      sourceLocale: task.sourceLanguageId ?? null,
      targetLocales: [targetLanguageId],
      units,
      exportArtifact,
      providerPayload: {
        status: task.status,
        title: task.title,
        fileIds: task.fileIds,
        stringIds: task.stringIds,
        webUrl: task.webUrl,
        stringPullStrategy: pullStrategy,
        ...(countsByFileId ? { stringPullCountsByFileId: countsByFileId } : {}),
      },
    };
  }

  /**
   * Uploads or updates a source file in Crowdin via temporary storage.
   *
   * Creates missing directory segments under the optional branch. Returns
   * `crowdin_branch_not_found` when the requested branch does not exist.
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
    const projectId = Number(scope.externalProjectId);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return err({ code: "invalid_crowdin_project_id" });
    }

    const branchIdResult = await this.resolveBranchId(client, projectId, scope.file.branch);
    if (!branchIdResult.ok) {
      return branchIdResult;
    }

    const branchId = branchIdResult.value;
    const sourcePath = providerSourcePath(scope.file);
    const pathSegments = sourcePath.split("/").filter(Boolean);
    const name = providerFilename(scope.file);
    const directorySegments = pathSegments.length > 1 ? pathSegments.slice(0, -1) : [];
    const directoryId = await this.ensureDirectory(client, projectId, branchId, directorySegments);
    const files = await client.listFiles(
      projectId,
      branchId ?? undefined,
      directoryId ?? undefined,
    );
    const existing = files.find((item) => item.name === name);
    const storage = await client.addStorage({
      fileName: name,
      content: scope.file.content,
      contentType: scope.file.contentType,
    });

    const uploaded = existing
      ? await client.updateSourceFile(projectId, existing.id, { storageId: storage.id, name })
      : await client.addSourceFile(projectId, {
          storageId: storage.id,
          name,
          branchId,
          directoryId,
        });

    return ok({
      sourcePath,
      externalResourceId: String(uploaded.id),
      revision: String(uploaded.revisionId),
      providerPayload: {
        storageId: storage.id,
        branchId: uploaded.branchId,
        directoryId: uploaded.directoryId,
        name: uploaded.name,
        path: uploaded.path,
        status: uploaded.status,
      },
    });
  }

  /**
   * Writes approved translations back to Crowdin and triggers a translation build.
   *
   * Groups uploads by `(fileId, locale)` JSON bundles, auto-approves imported strings, then
   * requests an approved-only project translation build for the task target language.
   */
  async pushTranslations(scope: TmsProviderPushTranslationsScope) {
    const client = this.createClient(scope);
    const projectId = Number(scope.externalProjectId);
    const taskId = Number(scope.externalJobId);
    if (Number.isNaN(projectId) || Number.isNaN(taskId)) {
      throw new Error("invalid_crowdin_project_or_task_id");
    }

    let task: Awaited<ReturnType<CrowdinApiClient["getTask"]>>;
    try {
      task = await client.getTask(projectId, taskId);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const targetLanguageId = task.targetLanguageId ?? task.languageId;
    if (!targetLanguageId) {
      throw new Error("crowdin_task_missing_target_language");
    }

    let uploaded = 0;
    let failed = 0;
    const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];
    const asyncOperations: Array<Record<string, unknown>> = [];
    const groups = new Map<
      string,
      {
        fileId: number;
        locale: string;
        fileName: string;
        entries: Array<{ key: string; text: string }>;
      }
    >();

    for (const translation of scope.translations) {
      const fileId = Number(translation.fileId ?? task.fileIds?.[0]);
      if (Number.isNaN(fileId)) {
        failed += 1;
        failures.push({
          locale: translation.locale,
          fileId: translation.fileId ?? null,
          message: "crowdin_translation_missing_file_id",
        });
        continue;
      }

      const key = `${fileId}:${translation.locale}`;
      const existing = groups.get(key) ?? {
        fileId,
        locale: translation.locale,
        fileName: translation.fileName ?? `hyperlocalise-${fileId}-${translation.locale}.json`,
        entries: [],
      };
      const entryKey = translation.key ?? translation.externalStringId;
      if (!entryKey) {
        failed += 1;
        failures.push({
          locale: translation.locale,
          fileId: translation.fileId ?? null,
          message: "crowdin_translation_missing_key",
        });
        continue;
      }

      existing.entries.push({ key: entryKey, text: translation.text });
      groups.set(key, existing);
    }

    if (groups.size === 0) {
      return { uploaded, failed, failures, asyncOperations };
    }

    for (const group of groups.values()) {
      try {
        const storage = await client.addStorage({
          fileName: group.fileName,
          content: this.buildJsonUpload(group.entries),
          contentType: "application/json",
        });
        const importResult = await client.uploadTranslations(projectId, group.locale, {
          storageId: storage.id,
          fileId: group.fileId,
          autoApproveImported: true,
        });

        uploaded += group.entries.length;
        asyncOperations.push({
          type: "crowdin_upload_translations",
          storageId: storage.id,
          fileId: group.fileId,
          languageId: group.locale,
          importResult,
        });
      } catch (error) {
        failed += group.entries.length;
        failures.push({
          locale: group.locale,
          fileId: String(group.fileId),
          message: error instanceof Error ? error.message : "crowdin translation upload failed",
        });
        asyncOperations.push({
          type: "crowdin_upload_translations",
          fileId: group.fileId,
          languageId: group.locale,
          status: "failed",
          error: error instanceof Error ? error.message : "crowdin translation upload failed",
        });
      }
    }

    if (groups.size > 0 && uploaded === 0 && failed > 0) {
      return { uploaded, failed, failures, asyncOperations };
    }

    try {
      const build = await client.buildProjectTranslation(projectId, {
        targetLanguageIds: [targetLanguageId],
        exportApprovedOnly: true,
      });
      const finishedBuild = await client.waitForTranslationBuild(projectId, build.id);
      const downloadLink = await client.downloadTranslationBuild(projectId, finishedBuild.id);
      asyncOperations.push({
        type: "crowdin_translation_build",
        buildId: finishedBuild.id,
        status: finishedBuild.status,
        downloadUrl: downloadLink.url,
      });
    } catch (error) {
      asyncOperations.push({
        type: "crowdin_translation_build",
        status: "failed",
        error: error instanceof Error ? error.message : "crowdin translation build failed",
        responseBody: error instanceof CrowdinApiError ? error.responseBody : undefined,
      });
      failures.push({
        locale: targetLanguageId,
        fileId: null,
        message: error instanceof Error ? error.message : "crowdin translation build failed",
      });
    }

    return { uploaded, failed, failures, asyncOperations };
  }

  /**
   * Pulls string comments/issues and task comments into a normalized provider review report.
   *
   * Merges review threads from both string-level and task-level Crowdin comment APIs and
   * deduplicates by computed thread id.
   */
  async pullReview(scope: TmsProviderPullReviewScope) {
    const client = this.createClient(scope);
    const projectId = Number(scope.externalProjectId);
    const taskId = Number(scope.externalJobId);
    if (
      !scope.externalProjectId.trim() ||
      !scope.externalJobId.trim() ||
      Number.isNaN(projectId) ||
      Number.isNaN(taskId)
    ) {
      throw new Error("invalid_crowdin_project_or_task_id");
    }

    let task: Awaited<ReturnType<CrowdinApiClient["getTask"]>>;
    let project: Awaited<ReturnType<CrowdinApiClient["getProject"]>>;
    try {
      [task, project] = await Promise.all([
        client.getTask(projectId, taskId),
        client.getProject(projectId),
      ]);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const stringKeyById = new Map(
      scope.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
    );
    const stringIds = new Set<number>();
    for (const unit of scope.content.units) {
      const stringId = Number(unit.externalStringId);
      if (!Number.isNaN(stringId)) {
        stringIds.add(stringId);
      }
    }
    if (task.stringIds) {
      for (const stringId of task.stringIds) {
        stringIds.add(stringId);
      }
    }

    const stringComments: Awaited<ReturnType<CrowdinApiClient["listStringComments"]>> = [];
    const stringIdList = [...stringIds];
    for (const chunk of this.chunkArray(stringIdList, 25)) {
      const chunkResults = await Promise.all(
        chunk.map((stringId) => client.listStringComments(projectId, { stringId })),
      );
      for (const comments of chunkResults) {
        stringComments.push(...comments);
      }
    }

    const taskComments = await client.listTaskComments(projectId, taskId);
    const threads = [
      ...stringComments.map((comment) =>
        this.normalizeStringCommentToThread({
          comment,
          externalProjectId: scope.externalProjectId,
          externalJobId: scope.externalJobId,
          projectWebUrl: project.webUrl,
          stringKeyById,
        }),
      ),
      ...taskComments.map((comment) =>
        this.normalizeTaskCommentToThread({
          comment,
          externalProjectId: scope.externalProjectId,
          externalJobId: scope.externalJobId,
          taskWebUrl: task.webUrl,
        }),
      ),
    ];
    const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));

    return buildProviderReviewReport([...deduped.values()]);
  }

  /**
   * Pushes QA findings to Crowdin as unresolved string issues.
   *
   * Skips findings whose Hyperlocalise marker already exists remotely or in `knownExternalIds`.
   * Issue type is derived from finding severity.
   */
  async pushComments(scope: TmsProviderCommentPushScope) {
    const client = this.createClient(scope);
    const projectId = Number(scope.externalProjectId.trim());
    if (!scope.externalProjectId.trim() || Number.isNaN(projectId)) {
      throw new Error("invalid_crowdin_project_id");
    }

    const locales = new Set(
      scope.feedback.map((item) => item.finding.item.locale?.trim()).filter(Boolean),
    );
    const defaultLocaleId = locales.size === 1 ? ([...locales][0] ?? null) : null;
    const { entries, failures: validationFailures } = this.buildCommentWriteBackEntries({
      findings: scope.feedback.map((item) => item.finding),
      defaultLocaleId,
    });
    const entryByFindingId = new Map(entries.map((entry) => [entry.findingId, entry]));
    const changedItems: TmsProviderCommentPushResult["changedItems"] = [];
    const failures = [...validationFailures];
    let posted = 0;
    let skipped = 0;
    let failed = validationFailures.length;
    const stringIds = [...new Set(entries.map((entry) => entry.request.stringId))];
    const remoteCommentIdsByFindingId = new Map<string, string>();

    if (stringIds.length > 0) {
      try {
        const remoteIssues = await client.listStringComments(projectId, {
          type: "issue",
          issueStatus: "unresolved",
        });

        for (const comment of remoteIssues) {
          if (!stringIds.includes(comment.stringId)) {
            continue;
          }
          const findingId = this.parseFindingMarker(comment.text);
          if (findingId) {
            remoteCommentIdsByFindingId.set(findingId, String(comment.id));
          }
        }
      } catch (error) {
        this.rethrowAuthError(error);
        throw error;
      }
    }

    for (const item of scope.feedback) {
      const findingId = item.findingId || buildFindingId(item.finding);
      const entry = entryByFindingId.get(findingId);
      if (!entry) {
        continue;
      }

      const known = scope.knownExternalIds.get(findingId) ?? null;
      const remoteCommentId = remoteCommentIdsByFindingId.get(findingId) ?? null;
      const existingCommentId = known?.commentUid ?? known?.issueUid ?? remoteCommentId;

      if (existingCommentId) {
        skipped += 1;
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "skipped",
          externalIssueUid: existingCommentId,
          externalCommentUid: existingCommentId,
          hashcode: String(entry.request.stringId),
          locale: entry.request.targetLanguageId,
          message: "provider_comment_already_exists",
          providerReviewContext: item.providerReviewContext ?? {
            externalProjectId: scope.externalProjectId,
            externalJobId: scope.externalJobId,
            externalThreadId: existingCommentId,
            externalCommentId: existingCommentId,
          },
        });
        continue;
      }

      try {
        const created = await client.addStringComment(projectId, entry.request);
        const commentId = String(created.id);
        posted += 1;
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "posted",
          externalIssueUid: commentId,
          externalCommentUid: commentId,
          hashcode: String(entry.request.stringId),
          locale: entry.request.targetLanguageId,
          providerReviewContext: item.providerReviewContext ?? {
            externalProjectId: scope.externalProjectId,
            externalJobId: scope.externalJobId,
            externalThreadId: commentId,
            externalCommentId: commentId,
          },
        });
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "crowdin_provider_comment_create_failed";
        failures.push({ findingId, message });
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "failed",
          hashcode: String(entry.request.stringId),
          locale: entry.request.targetLanguageId,
          message,
          providerReviewContext: item.providerReviewContext,
        });
      }
    }

    return { posted, skipped, failed, changedItems, failures };
  }

  /** Live glossary concordance search scoped to glossaries already synced into Hyperlocalise. */
  async searchGlossaryMatches(input: ExternalTmsGlossaryMatcherInput) {
    const projectId = Number(input.externalProjectId);
    if (Number.isNaN(projectId)) {
      return [];
    }

    const client = this.createClient(input);
    let results: Awaited<ReturnType<CrowdinApiClient["glossaryConcordanceSearch"]>>;
    try {
      results = await client.glossaryConcordanceSearch(projectId, {
        sourceLanguageId: input.sourceLocale,
        targetLanguageId: input.targetLocale,
        expressions: [input.sourceText],
      });
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const glossaryByExternalId = new Map(
      input.glossaries
        .filter((glossary) => glossary.externalGlossaryId)
        .map((glossary) => [glossary.externalGlossaryId, glossary]),
    );
    const liveMatches = [];

    for (const [index, result] of results.entries()) {
      const glossary = glossaryByExternalId.get(String(result.glossary.id));
      if (!glossary) {
        continue;
      }

      const sourceTerm = this.pickTermText(result.sourceTerms, input.sourceLocale);
      const targetTerm = this.pickTermText(result.targetTerms, input.targetLocale);
      if (!sourceTerm || !targetTerm) {
        continue;
      }

      const status =
        this.pickTermStatus(result.targetTerms, input.targetLocale) ??
        this.pickTermStatus(result.sourceTerms, input.sourceLocale);
      const providerTermId = result.sourceTerms[0]?.id ?? result.targetTerms[0]?.id;
      const externalTermId =
        providerTermId != null
          ? String(providerTermId)
          : this.stableConcordanceTermId(glossary.id, sourceTerm, input.targetLocale);

      liveMatches.push(
        normalizeProviderGlossaryMatch({
          sourceTerm,
          targetTerm,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          providerKind: this.kind,
          resourceId: glossary.id,
          externalResourceId: String(result.glossary.id),
          externalTermId,
          glossaryName: glossary.name,
          rank: 1 - index * 0.01,
          status: { status },
        }),
      );
    }

    return liveMatches.slice(0, input.limit);
  }

  /** Live translation memory concordance search against Crowdin TM segments. */
  async searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    const projectId = Number(input.externalProjectId);
    if (Number.isNaN(projectId)) {
      return [];
    }

    const client = this.createClient(input);
    let results: Awaited<ReturnType<CrowdinApiClient["concordanceSearch"]>>;
    try {
      results = await client.concordanceSearch(projectId, {
        sourceLanguageId: input.sourceLocale,
        targetLanguageId: input.targetLocale,
        expressions: [input.sourceText],
        minRelevant: 50,
        autoSubstitution: false,
      });
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    const externalMemoryId = input.memory.externalMemoryId
      ? Number(input.memory.externalMemoryId)
      : null;

    return results
      .filter((result) => externalMemoryId === null || result.tm.id === externalMemoryId)
      .slice(0, input.limit)
      .map((result, index) =>
        normalizeProviderTranslationMemoryMatch({
          sourceText: result.source,
          targetText: result.target,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          matchScore: result.relevant,
          providerKind: this.kind,
          resourceId: input.memory.id,
          externalResourceId: String(result.tm.id),
          externalSegmentId: String(result.recordId),
          memoryName: input.memory.name,
          rank: 1 - index * 0.01,
        }),
      );
  }

  /**
   * Lists tasks assigned to the connected Crowdin user, optionally filtered by project.
   *
   * Used for user-scoped job discovery outside organization project sync.
   */
  async fetchUserJobTasks(input: {
    credential: { baseUrl?: string | null };
    secretMaterial: string;
    externalProjectId?: string;
    fetchAllTasks?: boolean;
  }): Promise<ExternalTmsJobTaskMetadata[]> {
    const client = this.createClient(input);

    const projectId =
      input.externalProjectId !== undefined ? Number(input.externalProjectId) : undefined;
    if (projectId !== undefined && Number.isNaN(projectId)) {
      throw new Error("invalid_crowdin_project_id");
    }

    let tasks: Awaited<ReturnType<CrowdinApiClient["listUserTasks"]>>;
    try {
      tasks = await client.listUserTasks({
        ...(projectId !== undefined ? { projectId } : {}),
        fetchAll: input.fetchAllTasks ?? false,
      });
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }

    return tasks.map((task) => this.mapTaskToJobTaskMetadata(task, {}));
  }

  private buildCreateTaskRequest(
    task: TmsProviderCreateJobTaskScope["task"],
  ): CrowdinCreateTaskRequest {
    const title = task.title.trim();
    if (!title) {
      throw new Error("crowdin_task_title_required");
    }

    const languageId = task.targetLocale.trim();
    if (!languageId) {
      throw new Error("crowdin_task_target_locale_required");
    }

    const fileIds = this.parseCrowdinIdList(task.fileIds, "fileIds");
    const stringIds = this.parseCrowdinIdList(task.stringIds, "stringIds");
    const branchIds = this.parseCrowdinIdList(task.branchIds, "branchIds");
    const sourceScopeCount = [fileIds, stringIds, branchIds].filter(
      (ids) => ids !== undefined && ids.length > 0,
    ).length;

    if (sourceScopeCount === 0) {
      throw new Error("crowdin_task_source_scope_required");
    }
    if (sourceScopeCount > 1) {
      throw new Error("crowdin_task_source_scope_ambiguous");
    }

    const labelIds = this.parseCrowdinIdList(task.labelIds, "labelIds");
    const excludeLabelIds = this.parseCrowdinIdList(task.excludeLabelIds, "excludeLabelIds");
    const assignees = task.assignees?.map((assignee) => {
      const id = this.parseCrowdinId(assignee.externalUserId, "assigneeId");
      return {
        id,
        ...(assignee.wordsCount !== undefined ? { wordsCount: assignee.wordsCount } : {}),
      };
    });

    return {
      title,
      languageId,
      type: this.mapCreateTaskKindToCrowdinType(task.kind),
      ...(fileIds ? { fileIds } : {}),
      ...(stringIds ? { stringIds } : {}),
      ...(branchIds ? { branchIds } : {}),
      ...(labelIds ? { labelIds } : {}),
      ...(excludeLabelIds ? { excludeLabelIds } : {}),
      ...(task.status ? { status: task.status } : {}),
      ...(task.description?.trim() ? { description: task.description.trim() } : {}),
      ...(task.splitContent !== undefined ? { splitContent: task.splitContent } : {}),
      ...(task.skipAssignedStrings !== undefined
        ? { skipAssignedStrings: task.skipAssignedStrings }
        : {}),
      ...(task.includePreTranslatedStringsOnly !== undefined
        ? { includePreTranslatedStringsOnly: task.includePreTranslatedStringsOnly }
        : {}),
      ...(assignees?.length ? { assignees } : {}),
      ...this.optionalDateFields({
        deadline: task.dueDate,
        startedAt: task.startedAt,
        dateFrom: task.dateFrom,
        dateTo: task.dateTo,
      }),
    };
  }

  private parseCrowdinIdList(values: string[] | undefined, fieldName: string) {
    if (!values || values.length === 0) {
      return undefined;
    }

    return values.map((value) => this.parseCrowdinId(value, fieldName));
  }

  private parseCrowdinId(value: string, fieldName: string) {
    const id = Number(value.trim());
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`invalid_crowdin_task_${fieldName}`);
    }

    return id;
  }

  private mapCreateTaskKindToCrowdinType(
    kind: TmsProviderCreateJobTaskScope["task"]["kind"],
  ): 0 | 1 {
    if (kind === "review" || kind === "proofread") {
      return 1;
    }

    return 0;
  }

  private optionalDateFields(input: {
    deadline?: Date | string | null;
    startedAt?: Date | string | null;
    dateFrom?: Date | string | null;
    dateTo?: Date | string | null;
  }): Pick<CrowdinCreateTaskRequest, "deadline" | "startedAt" | "dateFrom" | "dateTo"> {
    return {
      ...(input.deadline ? { deadline: this.formatCrowdinTaskDate(input.deadline) } : {}),
      ...(input.startedAt ? { startedAt: this.formatCrowdinTaskDate(input.startedAt) } : {}),
      ...(input.dateFrom ? { dateFrom: this.formatCrowdinTaskDate(input.dateFrom) } : {}),
      ...(input.dateTo ? { dateTo: this.formatCrowdinTaskDate(input.dateTo) } : {}),
    };
  }

  private formatCrowdinTaskDate(value: Date | string) {
    return value instanceof Date ? value.toISOString() : value;
  }

  /** Maps a Crowdin task API record to shared {@link ExternalTmsJobTaskMetadata}. */
  mapTaskToJobTaskMetadata(
    task: CrowdinTask,
    localeReadinessByLanguage: Record<string, unknown>,
  ): ExternalTmsJobTaskMetadata {
    const targetLocales = this.extractTaskTargetLocales(task);
    const sourceLanguageId = this.extractTaskSourceLanguageId(task);
    const primaryLanguageId = this.extractTaskPrimaryLanguageId(task);
    const localeReadinessKey = primaryLanguageId ?? targetLocales[0] ?? null;

    return {
      externalJobId: String(task.id),
      externalTaskId: null,
      externalStatus: task.status,
      title: task.title,
      dueDate: task.deadline ? new Date(task.deadline) : null,
      targetLocales,
      assignedUsers:
        task.assignees?.map((assignee) =>
          assignee.username ? assignee.username : String(assignee.id),
        ) ?? [],
      externalUrl: task.webUrl,
      providerPayload: {
        projectId: task.projectId,
        type: task.type,
        description: task.description,
        fileIds: task.fileIds,
        languageId: primaryLanguageId ?? task.languageId,
        sourceLanguageId,
        targetLanguageId: task.targetLanguageId ?? null,
        targetLanguageIds: targetLocales,
        localeReadiness: localeReadinessKey
          ? (localeReadinessByLanguage[localeReadinessKey] ?? null)
          : localeReadinessByLanguage,
      },
      kind: this.mapTaskTypeToKind(task.type),
    };
  }

  /** Converts Crowdin project language progress rows into locale readiness metadata. */
  mapLanguageProgressToLocaleReadiness(
    progress: Awaited<ReturnType<CrowdinApiClient["listProjectLanguageProgress"]>>,
  ): Record<string, unknown> {
    const localeReadiness: Record<string, unknown> = {};
    for (const lang of progress) {
      localeReadiness[lang.languageId] = {
        translationProgress: lang.translationProgress,
        approvalProgress: lang.approvalProgress,
        words: lang.words,
        phrases: lang.phrases,
      };
    }
    return localeReadiness;
  }

  /**
   * Fetches enriched project metadata for linking flows, including branch list when available.
   *
   * Returns `null` when the Crowdin project no longer exists (404).
   */
  async fetchProjectDetailMetadata(input: {
    projectId: number;
    token: string;
    baseUrl?: string;
  }): Promise<ExternalTmsProjectMetadata | null> {
    const client = this.createClient({
      credential: { baseUrl: input.baseUrl ?? null },
      secretMaterial: input.token,
    });

    let project: CrowdinProject;
    try {
      project = await client.getProject(input.projectId);
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 404) {
        return null;
      }
      this.rethrowAuthError(error);
      throw error;
    }

    const metadata = this.mapProjectToMetadata(project);

    try {
      const branches = await client.listBranches(project.id);
      return {
        ...metadata,
        metadata: {
          ...metadata.metadata,
          branches: branches.map((branch) => ({
            id: branch.id,
            name: branch.name,
            title: branch.title,
          })),
        },
      };
    } catch (error) {
      this.rethrowAuthError(error);

      return {
        ...metadata,
        metadata: {
          ...metadata.metadata,
          syncWarning: error instanceof Error ? error.message : "branch_fetch_failed",
        },
      };
    }
  }

  /**
   * Agent-facing Crowdin progress check at project, file, or string granularity.
   *
   * Resolves credentials via {@link crowdinAuth} and actor-scoped tokens. File and string
   * scopes support fuzzy path/identifier matching with ambiguity errors.
   */
  async checkProgress(
    input: CheckCrowdinProgressInput,
  ): Promise<Result<CheckCrowdinProgressResult, CrowdinProgressError>> {
    const clientResult = await this.createProgressClient(input);
    if (isErr(clientResult)) {
      return clientResult;
    }

    const { client, crowdinProjectId } = clientResult.value;

    try {
      const crowdinProject = await client.getProject(crowdinProjectId);
      const languageFilter = input.languageIds?.length ? input.languageIds : undefined;

      if (input.scope === "project") {
        const languages = await client.listProjectLanguageProgress(crowdinProjectId, {
          languageIds: languageFilter,
        });

        return ok({
          scope: "project",
          crowdinProjectId,
          crowdinProjectName: crowdinProject.name,
          languages: languages.map((progress) => this.toProgressLanguageSummary(progress)),
        });
      }

      if (input.scope === "file") {
        const fileResult = await this.resolveProgressFile(client, crowdinProjectId, input);
        if (isErr(fileResult)) {
          return fileResult;
        }

        const file = fileResult.value;
        const languages = await client.listFileLanguageProgress(crowdinProjectId, file.id, {
          languageIds: languageFilter,
        });

        return ok({
          scope: "file",
          crowdinProjectId,
          crowdinProjectName: crowdinProject.name,
          resource: {
            type: "file",
            id: file.id,
            path: file.path,
          },
          languages: languages.map((progress) => this.toProgressLanguageSummary(progress)),
        });
      }

      const stringResult = await this.resolveProgressString(client, crowdinProjectId, input);
      if (isErr(stringResult)) {
        return stringResult;
      }

      const sourceString = stringResult.value;
      const languageIds =
        languageFilter ??
        crowdinProject.targetLanguageIds.filter(
          (languageId) => languageId !== crowdinProject.sourceLanguageId,
        );

      const stringTranslations = await this.loadStringTranslationStatus(
        client,
        crowdinProjectId,
        sourceString.id,
        languageIds,
      );

      return ok({
        scope: "string",
        crowdinProjectId,
        crowdinProjectName: crowdinProject.name,
        resource: {
          type: "string",
          id: sourceString.id,
          identifier: sourceString.identifier,
          text: this.formatProgressStringText(sourceString.text),
        },
        languages: stringTranslations.map((entry) => ({
          languageId: entry.languageId,
          translationProgress: entry.translated ? 100 : 0,
          approvalProgress: entry.approved ? 100 : 0,
          words: {
            total: 1,
            translated: entry.translated ? 1 : 0,
            approved: entry.approved ? 1 : 0,
          },
          phrases: {
            total: 1,
            translated: entry.translated ? 1 : 0,
            approved: entry.approved ? 1 : 0,
          },
        })),
        stringTranslations,
      });
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 401) {
        return err({
          code: "crowdin_api_error",
          message: "Your Crowdin connection is invalid. Reconnect Crowdin and try again.",
        });
      }

      return err({
        code: "crowdin_api_error",
        message: error instanceof Error ? error.message : "Crowdin API request failed.",
      });
    }
  }

  /**
   * Live CAT concordance: parallel glossary and TM search for a source expression.
   *
   * Throws {@link TmsProviderLiveError} on auth, permission, or fetch failures.
   */
  async searchCatConcordance(input: {
    client: CrowdinApiClient;
    externalProjectId: string;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    glossaryLimit?: number;
    translationMemoryLimit?: number;
  }): Promise<{
    glossaryTerms: NormalizedGlossaryMatch[];
    translationMemoryMatches: NormalizedTranslationMemoryMatch[];
  }> {
    const projectId = Number(input.externalProjectId);
    if (Number.isNaN(projectId)) {
      return { glossaryTerms: [], translationMemoryMatches: [] };
    }

    const glossaryLimit = input.glossaryLimit ?? 20;
    const translationMemoryLimit = input.translationMemoryLimit ?? 10;

    let glossaryResults: Awaited<ReturnType<CrowdinApiClient["glossaryConcordanceSearch"]>>;
    let translationMemoryResults: Awaited<ReturnType<CrowdinApiClient["concordanceSearch"]>>;

    try {
      [glossaryResults, translationMemoryResults] = await Promise.all([
        input.client.glossaryConcordanceSearch(projectId, {
          sourceLanguageId: input.sourceLocale,
          targetLanguageId: input.targetLocale,
          expressions: [input.sourceText],
        }),
        input.client.concordanceSearch(projectId, {
          sourceLanguageId: input.sourceLocale,
          targetLanguageId: input.targetLocale,
          expressions: [input.sourceText],
          minRelevant: 50,
          autoSubstitution: false,
        }),
      ]);
    } catch (error) {
      this.rethrowCatConcordanceError(error);
    }

    const glossaryTerms: NormalizedGlossaryMatch[] = [];

    for (const [index, result] of glossaryResults.entries()) {
      const sourceTerm = this.pickTermText(result.sourceTerms, input.sourceLocale);
      const targetTerm = this.pickTermText(result.targetTerms, input.targetLocale);
      if (!sourceTerm || !targetTerm) {
        continue;
      }

      const externalGlossaryId = String(result.glossary.id);
      const status =
        this.pickTermStatus(result.targetTerms, input.targetLocale) ??
        this.pickTermStatus(result.sourceTerms, input.sourceLocale);
      const providerTermId = result.sourceTerms[0]?.id ?? result.targetTerms[0]?.id;
      const externalTermId =
        providerTermId != null
          ? String(providerTermId)
          : this.stableConcordanceTermId(externalGlossaryId, sourceTerm, input.targetLocale);

      glossaryTerms.push(
        normalizeProviderGlossaryMatch({
          sourceTerm,
          targetTerm,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          providerKind: this.kind,
          resourceId: externalGlossaryId,
          externalResourceId: externalGlossaryId,
          externalTermId,
          glossaryName: result.glossary.name,
          rank: 1 - index * 0.01,
          status: { status },
        }),
      );
    }

    const translationMemoryMatches = translationMemoryResults
      .slice(0, translationMemoryLimit)
      .map((result, index) =>
        normalizeProviderTranslationMemoryMatch({
          sourceText: result.source,
          targetText: result.target,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          matchScore: result.relevant,
          providerKind: this.kind,
          resourceId: String(result.tm.id),
          externalResourceId: String(result.tm.id),
          externalSegmentId: String(result.recordId),
          memoryName: result.tm.name,
          rank: 1 - index * 0.01,
        }),
      );

    return {
      glossaryTerms: glossaryTerms.slice(0, glossaryLimit),
      translationMemoryMatches,
    };
  }

  /**
   * Loads screenshot visual context for a Crowdin source string.
   *
   * Maps screenshot tags into percent-based CAT markers when position data is present.
   */
  async loadCatVisualContext(input: {
    client: CrowdinApiClient;
    externalProjectId: string;
    externalStringId: string;
  }): Promise<CatVisualContext> {
    const projectId = Number(input.externalProjectId);
    const stringId = Number(input.externalStringId);
    if (Number.isNaN(projectId) || Number.isNaN(stringId)) {
      return { screenshots: [] };
    }

    const screenshots = await input.client.listScreenshots(projectId, {
      stringIds: [stringId],
      maxItems: MAX_CROWDIN_SCREENSHOTS_PER_SEGMENT,
    });

    return {
      screenshots: screenshots.flatMap((screenshot) =>
        this.mapCatVisualContextScreenshot(screenshot, stringId),
      ),
    };
  }

  private rethrowCatConcordanceError(error: unknown): never {
    if (error instanceof CrowdinApiError) {
      if (error.status === 401 || error.status === 403) {
        throw new TmsProviderLiveError(
          "crowdin_auth_invalid",
          "Crowdin credentials are invalid or lack permission for this project.",
        );
      }
      if (error.status === 404) {
        throw new TmsProviderLiveError(
          "invalid_crowdin_project_or_file_id",
          "The Crowdin project could not be found.",
        );
      }
      throw new TmsProviderLiveError(
        "provider_fetch_failed",
        "Failed to fetch glossary and translation memory from Crowdin.",
      );
    }

    if (error instanceof Error && error.message === "crowdin_auth_invalid") {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }

    throw error;
  }

  private mapCatVisualContextScreenshot(
    screenshot: Awaited<ReturnType<CrowdinApiClient["listScreenshots"]>>[number],
    stringId: number,
  ): CatVisualContextScreenshot[] {
    const imageUrl = screenshot.webUrl?.trim();
    if (!imageUrl) {
      return [];
    }

    const markers = (screenshot.tags ?? [])
      .filter((tag) => tag.stringId === stringId && tag.position)
      .map((tag) =>
        pixelRectToPercentMarkers({
          width: screenshot.size?.width,
          height: screenshot.size?.height,
          left: tag.position?.x ?? 0,
          top: tag.position?.y ?? 0,
          widthPx: tag.position?.width ?? 0,
          heightPx: tag.position?.height ?? 0,
        }),
      )
      .filter((marker): marker is NonNullable<typeof marker> => marker != null);

    return [
      {
        id: String(screenshot.id),
        name: screenshot.name?.trim() || null,
        imageUrl,
        width: screenshot.size?.width ?? null,
        height: screenshot.size?.height ?? null,
        markers,
      },
    ];
  }

  private async createProgressClient(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string | null;
  }): Promise<
    Result<
      { client: CrowdinApiClient; crowdinProjectId: number },
      Extract<CrowdinProgressError, { code: "crowdin_not_configured" | "crowdin_api_error" }>
    >
  > {
    const projectCredential = await crowdinAuth.loadProjectCredential(input);
    if (!projectCredential) {
      return err({
        code: "crowdin_not_configured" as const,
        message:
          "This project is not linked to Crowdin. Connect a Crowdin TMS project before checking progress.",
      });
    }

    const crowdinProjectId = Number.parseInt(projectCredential.externalProjectId, 10);
    if (!Number.isFinite(crowdinProjectId)) {
      return err({
        code: "crowdin_not_configured" as const,
        message: "The linked Crowdin project ID is invalid.",
      });
    }

    let token: string;
    try {
      token = await resolveExternalTmsSecretMaterialForActor({
        credential: projectCredential.credential,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      });
    } catch (error) {
      if (error instanceof Error) {
        const message = CROWDIN_USER_CONNECTION_ERROR_MESSAGES[error.message];
        if (message) {
          return err({
            code: "crowdin_api_error" as const,
            message,
          });
        }
      }

      throw error;
    }

    const client = this.createClient({
      credential: projectCredential.credential,
      secretMaterial: token,
    });
    return ok({ client, crowdinProjectId });
  }

  private toProgressLanguageSummary(
    progress: Awaited<ReturnType<CrowdinApiClient["listProjectLanguageProgress"]>>[number],
  ): CrowdinProgressLanguageSummary {
    return {
      languageId: progress.languageId,
      translationProgress: progress.translationProgress,
      approvalProgress: progress.approvalProgress,
      words: progress.words,
      phrases: progress.phrases,
    };
  }

  private normalizeProgressPath(value: string) {
    return value.trim().replace(/^\/+/, "").toLowerCase();
  }

  private async resolveProgressFile(
    client: CrowdinApiClient,
    crowdinProjectId: number,
    input: Pick<CheckCrowdinProgressInput, "fileId" | "filePath">,
  ): Promise<
    Result<
      CrowdinFile,
      Extract<
        CrowdinProgressError,
        { code: "crowdin_resource_not_found" | "crowdin_invalid_input" }
      >
    >
  > {
    if (input.fileId != null) {
      const files = await client.listFiles(crowdinProjectId);
      const match = files.find((file) => file.id === input.fileId);
      if (!match) {
        return err({
          code: "crowdin_resource_not_found" as const,
          message: `Crowdin file ${input.fileId} was not found in this project.`,
        });
      }

      return ok(match);
    }

    const filePath = input.filePath?.trim();
    if (!filePath) {
      return err({
        code: "crowdin_invalid_input" as const,
        message: "Provide fileId or filePath when checking file progress.",
      });
    }

    const normalizedTarget = this.normalizeProgressPath(filePath);
    const files = await client.listFiles(crowdinProjectId);
    const exact = files.find((file) => this.normalizeProgressPath(file.path) === normalizedTarget);
    if (exact) {
      return ok(exact);
    }

    const basename = normalizedTarget.split("/").at(-1);
    const basenameMatches = files.filter(
      (file) => this.normalizeProgressPath(file.name) === basename,
    );
    if (basenameMatches.length === 1) {
      return ok(basenameMatches[0]!);
    }

    const partialMatches = files.filter(
      (file) =>
        this.normalizeProgressPath(file.path).includes(normalizedTarget) ||
        this.normalizeProgressPath(file.name).includes(normalizedTarget),
    );
    if (partialMatches.length === 1) {
      return ok(partialMatches[0]!);
    }

    if (partialMatches.length > 1) {
      const paths = partialMatches.slice(0, 5).map((file) => file.path);
      return err({
        code: "crowdin_resource_not_found" as const,
        message: `Multiple Crowdin files matched "${filePath}". Specify fileId or a more precise path. Matches: ${paths.join(", ")}`,
      });
    }

    return err({
      code: "crowdin_resource_not_found" as const,
      message: `No Crowdin file matched "${filePath}".`,
    });
  }

  private async resolveProgressString(
    client: CrowdinApiClient,
    crowdinProjectId: number,
    input: Pick<CheckCrowdinProgressInput, "stringId" | "stringIdentifier">,
  ): Promise<
    Result<
      CrowdinSourceString,
      Extract<
        CrowdinProgressError,
        { code: "crowdin_resource_not_found" | "crowdin_invalid_input" }
      >
    >
  > {
    if (input.stringId != null) {
      const match = await client.getSourceString(crowdinProjectId, input.stringId);
      if (!match) {
        return err({
          code: "crowdin_resource_not_found" as const,
          message: `Crowdin string ${input.stringId} was not found in this project.`,
        });
      }

      return ok(match);
    }

    const identifier = input.stringIdentifier?.trim();
    if (!identifier) {
      return err({
        code: "crowdin_invalid_input" as const,
        message: "Provide stringId or stringIdentifier when checking string progress.",
      });
    }

    const escaped = escapeCrowdinCroqlString(identifier);
    const exactStrings = await client.listSourceStrings(crowdinProjectId, {
      croql: `identifier = "${escaped}"`,
      maxItems: 5,
    });
    if (exactStrings.length === 1) {
      return ok(exactStrings[0]!);
    }

    if (exactStrings.length > 1) {
      const ids = exactStrings.map((entry) => entry.id).join(", ");
      return err({
        code: "crowdin_resource_not_found" as const,
        message: `Multiple Crowdin strings matched identifier "${identifier}". Refine with stringId. Matches: ${ids}`,
      });
    }

    const partialStrings = await client.listSourceStrings(crowdinProjectId, {
      croql: `identifier contains "${escaped}"`,
      maxItems: 5,
    });
    if (partialStrings.length === 1) {
      return ok(partialStrings[0]!);
    }

    if (partialStrings.length > 1) {
      const ids = partialStrings.map((entry) => entry.id).join(", ");
      return err({
        code: "crowdin_resource_not_found" as const,
        message: `Multiple Crowdin strings partially matched "${identifier}". Refine with stringId. Matches: ${ids}`,
      });
    }

    return err({
      code: "crowdin_resource_not_found" as const,
      message: `No Crowdin string matched identifier "${identifier}".`,
    });
  }

  private formatProgressStringText(text: string | Record<string, string>) {
    if (typeof text === "string") {
      return text;
    }

    const values = Object.values(text);
    return values[0] ?? JSON.stringify(text);
  }

  private async loadStringTranslationStatus(
    client: CrowdinApiClient,
    crowdinProjectId: number,
    stringId: number,
    languageIds: string[],
  ) {
    const stringTranslations: CheckCrowdinProgressResult["stringTranslations"] = [];

    for (const languageId of languageIds) {
      const translations = await client.listStringTranslations(
        crowdinProjectId,
        stringId,
        languageId,
      );
      const latest = translations.at(-1) ?? null;
      const approvals = latest
        ? await client.listTranslationApprovals(crowdinProjectId, languageId, {
            stringId,
          })
        : [];

      stringTranslations.push({
        languageId,
        translated: Boolean(latest?.text?.trim()),
        approved: approvals.some((approval) => approval.translationId === latest?.id),
        text: latest?.text ?? null,
      });
    }

    return stringTranslations;
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private uniqueLocales(locales: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const locale of locales) {
      const trimmed = locale.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      unique.push(trimmed);
    }

    return unique;
  }

  private buildGlossaryTermRows(input: {
    glossaryId: number;
    sourceLanguageId: string;
    terms: Array<{
      id: number;
      conceptId: number;
      languageId: string;
      text: string;
      description: string;
      partOfSpeech: string;
      status: string;
      note: string;
    }>;
    targetLocales: string[];
  }) {
    const sourceTermsByConcept = new Map<number, (typeof input.terms)[number]>();
    const targetTermsByConcept = new Map<number, Array<(typeof input.terms)[number]>>();

    for (const term of input.terms) {
      if (term.languageId === input.sourceLanguageId) {
        if (!sourceTermsByConcept.has(term.conceptId)) {
          sourceTermsByConcept.set(term.conceptId, term);
        }
        continue;
      }

      const bucket = targetTermsByConcept.get(term.conceptId) ?? [];
      bucket.push(term);
      targetTermsByConcept.set(term.conceptId, bucket);
    }

    const rows: Array<{
      externalKey: string;
      sourceTerm: string;
      targetTerm: string;
      targetLocale: string;
      description: string;
      partOfSpeech: string;
      status: string;
      forbidden: boolean | null;
      notes: string | null;
      metadata: Record<string, unknown>;
    }> = [];

    for (const [conceptId, sourceTerm] of sourceTermsByConcept) {
      const targets = targetTermsByConcept.get(conceptId) ?? [];
      for (const targetLocale of input.targetLocales) {
        const targetTerm = targets.find((term) => term.languageId === targetLocale);

        if (!targetTerm?.text.trim()) {
          continue;
        }

        rows.push({
          externalKey: `${input.glossaryId}:${conceptId}:${targetLocale}`,
          sourceTerm: sourceTerm.text,
          targetTerm: targetTerm.text,
          targetLocale,
          description: sourceTerm.description || targetTerm.description,
          partOfSpeech: sourceTerm.partOfSpeech || targetTerm.partOfSpeech,
          status: targetTerm.status || sourceTerm.status,
          forbidden: null,
          notes: targetTerm.note || sourceTerm.note || null,
          metadata: {
            crowdinTermId: targetTerm.id,
            crowdinConceptId: conceptId,
          },
        });
      }
    }

    return rows;
  }

  private buildTranslationMemoryEntries(input: {
    memoryId: number;
    sourceLanguageId: string;
    targetLocales: string[];
    segments: Array<{
      id: number;
      records: Array<{ id: number; languageId: string; text: string }>;
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
      const sourceRecord = segment.records.find(
        (record) => record.languageId === input.sourceLanguageId && record.text.trim(),
      );
      if (!sourceRecord) {
        continue;
      }

      for (const targetLocale of input.targetLocales) {
        const targetRecord = segment.records.find(
          (record) => record.languageId === targetLocale && record.text.trim(),
        );
        if (!targetRecord) {
          continue;
        }

        entries.push({
          externalKey: `${input.memoryId}:${segment.id}:${targetLocale}`,
          sourceLocale: input.sourceLanguageId,
          targetLocale,
          sourceText: sourceRecord.text,
          targetText: targetRecord.text,
          matchScore: 100,
          metadata: {
            crowdinSegmentId: segment.id,
            crowdinSourceRecordId: sourceRecord.id,
            crowdinTargetRecordId: targetRecord.id,
          },
        });
      }
    }

    return entries;
  }

  private async resolveTaskSourceStrings(
    client: CrowdinApiClient,
    projectId: number,
    taskId: number,
    task: CrowdinTaskDetails,
  ): Promise<{
    sourceStrings: CrowdinSourceString[];
    pullStrategy: "taskId" | "stringIds" | "fileIds" | "none";
    countsByFileId?: Record<string, number>;
  }> {
    const logContext = {
      crowdinProjectId: projectId,
      crowdinTaskId: taskId,
      taskFileIdCount: task.fileIds?.length ?? 0,
      taskStringIdCount: task.stringIds?.length ?? 0,
    };
    const taskIdStrings = await client.listSourceStrings(projectId, { taskId });

    if (taskIdStrings.length > 0) {
      logger.info(
        { ...logContext, pullStrategy: "taskId", stringCount: taskIdStrings.length },
        "crowdin task source strings loaded via taskId filter",
      );
      return { sourceStrings: taskIdStrings, pullStrategy: "taskId" };
    }

    logger.info(
      { ...logContext, pullStrategy: "taskId", stringCount: 0 },
      "crowdin taskId string filter returned no strings; trying fallbacks",
    );

    const taskStringIds = (task.stringIds ?? []).filter(
      (stringId): stringId is number => typeof stringId === "number" && Number.isFinite(stringId),
    );
    if (taskStringIds.length > 0) {
      const stringIdStrings = await client.getSourceStringsByIds(projectId, taskStringIds);

      if (stringIdStrings.length > 0) {
        logger.info(
          {
            ...logContext,
            pullStrategy: "stringIds",
            requestedStringIdCount: taskStringIds.length,
            stringCount: stringIdStrings.length,
          },
          "crowdin task source strings loaded via task stringIds fallback",
        );
        return { sourceStrings: stringIdStrings, pullStrategy: "stringIds" };
      }

      logger.warn(
        {
          ...logContext,
          pullStrategy: "stringIds",
          requestedStringIdCount: taskStringIds.length,
          stringCount: 0,
        },
        "crowdin task stringIds fallback returned no strings",
      );
    }

    const taskFileIds = (task.fileIds ?? []).filter(
      (fileId): fileId is number => typeof fileId === "number" && Number.isFinite(fileId),
    );
    if (taskFileIds.length > 0) {
      const { strings, countsByFileId } = await this.listSourceStringsByFileIds(
        client,
        projectId,
        taskFileIds,
      );

      if (strings.length > 0) {
        logger.info(
          {
            ...logContext,
            pullStrategy: "fileIds",
            fileIds: taskFileIds,
            countsByFileId,
            stringCount: strings.length,
          },
          "crowdin task source strings loaded via task fileIds fallback",
        );
        return { sourceStrings: strings, pullStrategy: "fileIds", countsByFileId };
      }

      logger.warn(
        {
          ...logContext,
          pullStrategy: "fileIds",
          fileIds: taskFileIds,
          countsByFileId,
          stringCount: 0,
        },
        "crowdin task fileIds fallback returned no strings",
      );
    }

    logger.warn(
      { ...logContext, pullStrategy: "none", stringCount: 0 },
      "crowdin task string pull exhausted all strategies with no strings",
    );

    return { sourceStrings: [], pullStrategy: "none" };
  }

  private async listSourceStringsByFileIds(
    client: CrowdinApiClient,
    projectId: number,
    fileIds: number[],
  ): Promise<{ strings: CrowdinSourceString[]; countsByFileId: Record<string, number> }> {
    const uniqueFileIds = [...new Set(fileIds)];
    const results: CrowdinSourceString[] = [];
    const countsByFileId: Record<string, number> = {};

    for (const fileId of uniqueFileIds) {
      const fileStrings = await client.listSourceStrings(projectId, { fileId });
      countsByFileId[String(fileId)] = fileStrings.length;
      results.push(...fileStrings);
    }

    return {
      strings: this.dedupeSourceStringsById(results),
      countsByFileId,
    };
  }

  private dedupeSourceStringsById(strings: CrowdinSourceString[]): CrowdinSourceString[] {
    const byId = new Map<number, CrowdinSourceString>();
    for (const sourceString of strings) {
      byId.set(sourceString.id, sourceString);
    }
    return [...byId.values()];
  }

  private sourceTextValue(text: string | Record<string, string>): string {
    if (typeof text === "string") {
      return text;
    }

    return text.one ?? text.other ?? Object.values(text)[0] ?? "";
  }

  private buildJsonUpload(entries: Array<{ key: string; text: string }>) {
    const payload: Record<string, string> = {};
    for (const entry of entries) {
      if (Object.prototype.hasOwnProperty.call(payload, entry.key)) {
        console.warn(`buildJsonUpload: duplicate key "${entry.key}" - later value kept`);
      }
      payload[entry.key] = entry.text;
    }
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    return new TextEncoder().encode(serialized);
  }

  private stableConcordanceTermId(
    glossaryId: string,
    sourceTerm: string,
    targetLocale: string,
  ): string {
    return createHash("sha256")
      .update(`${glossaryId}\0${sourceTerm}\0${targetLocale}`, "utf8")
      .digest("hex");
  }

  private pickTermText(
    terms: Array<{ languageId: string; text: string }>,
    locale: string,
  ): string | null {
    const match = terms.find((term) => term.languageId === locale);
    return match?.text?.trim() ? match.text.trim() : null;
  }

  private pickTermStatus(
    terms: Array<{ languageId: string; status?: string | null }>,
    locale: string,
  ): string | null {
    const match = terms.find((term) => term.languageId === locale);
    return match?.status ?? null;
  }

  private sanitizeProjectLogo(value: string | null | undefined): string | null {
    if (!value?.trim()) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.startsWith("data:image/")) {
      return SAFE_DATA_IMAGE_PATTERN.test(trimmed) ? trimmed : null;
    }

    return sanitizeExternalUrl(trimmed);
  }

  private isResourceLinkedToProject(input: {
    projectId: number;
    projectIds?: number[];
    defaultProjectIds?: number[];
  }): boolean {
    const linkedProjectIds = [...(input.projectIds ?? []), ...(input.defaultProjectIds ?? [])];
    if (linkedProjectIds.length === 0) {
      return false;
    }

    return linkedProjectIds.includes(input.projectId);
  }

  private buildFindingMarker(findingId: string) {
    return `${HYPERLOCALISE_FINDING_MARKER_PREFIX}${findingId}]`;
  }

  private parseFindingMarker(issueText: string | null | undefined) {
    if (!issueText) {
      return null;
    }

    const match = issueText.match(/\[hyperlocalise:finding=([^\]]+)\]/);
    return match?.[1] ?? null;
  }

  private mapSeverityToCrowdinIssueType(severity: ProviderQaFinding["severity"]) {
    switch (severity) {
      case "error":
        return "translation_mistake";
      case "warning":
        return "general_question";
      case "info":
      default:
        return "context_request";
    }
  }

  private formatIssueText(finding: ProviderQaFinding, findingId: string) {
    const lines = [this.buildFindingMarker(findingId), `[${finding.checkType}] ${finding.message}`];

    if (finding.suggestedFix) {
      lines.push(`Suggested fix: ${finding.suggestedFix}`);
    }

    if (typeof finding.confidence === "number") {
      lines.push(`Confidence: ${finding.confidence}`);
    }

    return lines.join("\n");
  }

  private buildCommentWriteBackEntries(input: {
    findings: ProviderQaFinding[];
    defaultLocaleId: string | null;
  }): {
    entries: Array<{
      findingId: string;
      finding: ProviderQaFinding;
      request: {
        stringId: number;
        targetLanguageId: string;
        text: string;
        type: "issue";
        issueType: string;
      };
    }>;
    failures: Array<{ findingId: string; message: string }>;
  } {
    const entries: Array<{
      findingId: string;
      finding: ProviderQaFinding;
      request: {
        stringId: number;
        targetLanguageId: string;
        text: string;
        type: "issue";
        issueType: string;
      };
    }> = [];
    const failures: Array<{ findingId: string; message: string }> = [];

    for (const finding of input.findings) {
      const findingId = buildFindingId(finding);
      const rawStringId = finding.item.externalStringId.trim();
      const stringId = Number(rawStringId);
      const targetLanguageId = finding.item.locale?.trim() || input.defaultLocaleId?.trim() || "";

      if (!rawStringId || Number.isNaN(stringId)) {
        failures.push({
          findingId,
          message: "crowdin_comment_missing_string_id",
        });
        continue;
      }

      if (!targetLanguageId) {
        failures.push({
          findingId,
          message: "crowdin_comment_missing_locale",
        });
        continue;
      }

      entries.push({
        findingId,
        finding,
        request: {
          stringId,
          targetLanguageId,
          text: this.formatIssueText(finding, findingId),
          type: "issue",
          issueType: this.mapSeverityToCrowdinIssueType(finding.severity),
        },
      });
    }

    return { entries, failures };
  }

  private mapCrowdinUser(user: CrowdinShortUser | null | undefined): ProviderReviewAuthor | null {
    if (!user) {
      return null;
    }

    return {
      externalUserId: String(user.id),
      username: user.username ?? null,
      displayName: user.fullName?.trim() || user.username || null,
    };
  }

  private mapIssueState(issueStatus: string | null | undefined): ProviderReviewThreadState {
    if (issueStatus === "resolved") {
      return "resolved";
    }
    if (issueStatus === "unresolved") {
      return "open";
    }
    return "unknown";
  }

  private buildStringCommentProviderUrl(input: {
    projectWebUrl: string;
    stringId: number;
    commentId: number;
  }) {
    const base = input.projectWebUrl.replace(/\/+$/g, "");
    return `${base}/comments?commentId=${input.commentId}&stringId=${input.stringId}`;
  }

  private buildTaskCommentProviderUrl(input: { taskWebUrl: string; commentId: number }) {
    const base = input.taskWebUrl.replace(/\/+$/g, "");
    return `${base}#comment-${input.commentId}`;
  }

  private normalizeStringCommentToThread(input: {
    comment: CrowdinStringComment;
    externalProjectId: string;
    externalJobId: string;
    projectWebUrl: string;
    stringKeyById: Map<string, string>;
  }): ProviderReviewThread {
    const kind: ProviderReviewThreadKind = input.comment.type === "issue" ? "issue" : "comment";
    const externalThreadId = String(input.comment.id);
    const stringKey =
      input.stringKeyById.get(String(input.comment.stringId)) ?? String(input.comment.stringId);

    return {
      threadId: buildProviderReviewThreadId({
        providerKind: this.kind,
        externalProjectId: input.externalProjectId,
        externalJobId: input.externalJobId,
        kind,
        externalThreadId,
      }),
      kind,
      state: kind === "issue" ? this.mapIssueState(input.comment.issueStatus) : "unknown",
      subject: input.comment.text,
      issueType: input.comment.issueType ?? null,
      item: {
        externalStringId: String(input.comment.stringId),
        key: stringKey,
        locale: input.comment.languageId || undefined,
        field: "target",
      },
      locale: input.comment.languageId || null,
      comments: [
        {
          externalCommentId: externalThreadId,
          body: input.comment.text,
          author: this.mapCrowdinUser(input.comment.user),
          createdAt: input.comment.createdAt ?? null,
          updatedAt: input.comment.resolvedAt ?? input.comment.createdAt ?? null,
        },
      ],
      author: this.mapCrowdinUser(input.comment.user),
      resolver: this.mapCrowdinUser(input.comment.resolver),
      createdAt: input.comment.createdAt ?? null,
      updatedAt: input.comment.resolvedAt ?? input.comment.createdAt ?? null,
      resolvedAt: input.comment.resolvedAt ?? null,
      providerContext: {
        externalProjectId: input.externalProjectId,
        externalJobId: input.externalJobId,
        externalThreadId,
        externalCommentId: externalThreadId,
        providerUrl: this.buildStringCommentProviderUrl({
          projectWebUrl: input.projectWebUrl,
          stringId: input.comment.stringId,
          commentId: input.comment.id,
        }),
      },
    };
  }

  private normalizeTaskCommentToThread(input: {
    comment: CrowdinTaskComment;
    externalProjectId: string;
    externalJobId: string;
    taskWebUrl: string;
  }): ProviderReviewThread {
    const externalThreadId = String(input.comment.id);

    return {
      threadId: buildProviderReviewThreadId({
        providerKind: this.kind,
        externalProjectId: input.externalProjectId,
        externalJobId: input.externalJobId,
        kind: "task_comment",
        externalThreadId,
      }),
      kind: "task_comment",
      state: "unknown",
      subject: input.comment.text,
      comments: [
        {
          externalCommentId: externalThreadId,
          body: input.comment.text,
          author: {
            externalUserId: String(input.comment.userId),
          },
          createdAt: input.comment.createdAt ?? null,
          updatedAt: input.comment.updatedAt ?? null,
        },
      ],
      author: {
        externalUserId: String(input.comment.userId),
      },
      createdAt: input.comment.createdAt ?? null,
      updatedAt: input.comment.updatedAt ?? null,
      providerContext: {
        externalProjectId: input.externalProjectId,
        externalJobId: input.externalJobId,
        externalThreadId,
        externalCommentId: externalThreadId,
        providerUrl: this.buildTaskCommentProviderUrl({
          taskWebUrl: input.taskWebUrl,
          commentId: input.comment.id,
        }),
      },
    };
  }

  private extractTaskTargetLocales(task: {
    languageId?: string | null;
    targetLanguageId?: string | null;
    targetLanguages?: Array<{ id?: string | null }> | null;
  }): string[] {
    const fromTargetLanguages = (task.targetLanguages ?? [])
      .map((language) => language.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    if (fromTargetLanguages.length > 0) {
      return [...new Set(fromTargetLanguages)];
    }

    if (task.targetLanguageId?.trim()) {
      return [task.targetLanguageId];
    }

    if (task.languageId?.trim()) {
      return [task.languageId];
    }

    return [];
  }

  private extractTaskSourceLanguageId(task: { sourceLanguageId?: string | null }): string | null {
    const sourceLanguageId = task.sourceLanguageId?.trim();
    return sourceLanguageId ? sourceLanguageId : null;
  }

  private extractTaskPrimaryLanguageId(task: {
    languageId?: string | null;
    targetLanguageId?: string | null;
    targetLanguages?: Array<{ id?: string | null }> | null;
  }): string | null {
    const targetLanguageId = task.targetLanguageId?.trim();
    if (targetLanguageId) {
      return targetLanguageId;
    }

    const languageId = task.languageId?.trim();
    if (languageId) {
      return languageId;
    }

    const firstTargetLanguage = task.targetLanguages?.[0]?.id?.trim();
    return firstTargetLanguage ? firstTargetLanguage : null;
  }

  private mapProjectToMetadata(project: CrowdinProject) {
    return {
      externalProjectId: String(project.id),
      name: project.name,
      description: project.description?.trim() || null,
      sourceLocale: project.sourceLanguageId,
      targetLocales: project.targetLanguageIds,
      externalProjectUrl: project.webUrl,
      isActive: !project.isSuspended,
      logoUrl: this.sanitizeProjectLogo(project.logo),
      lastActivityAt: project.lastActivity?.trim() || null,
      metadata: {
        identifier: project.identifier,
      },
    };
  }

  private parseProjectId(externalProjectId: string) {
    const projectId = Number(externalProjectId);
    if (Number.isNaN(projectId)) {
      throw new Error("invalid_crowdin_project_id");
    }

    return projectId;
  }

  private rethrowAuthError(error: unknown) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
  }

  private async listBranches(client: CrowdinApiClient, projectId: number) {
    try {
      return await client.listBranches(projectId);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }
  }

  private async listDirectories(client: CrowdinApiClient, projectId: number, branchId?: number) {
    try {
      return await client.listDirectories(projectId, branchId);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }
  }

  private async listFiles(client: CrowdinApiClient, projectId: number, branchId?: number) {
    try {
      return await client.listFiles(projectId, branchId);
    } catch (error) {
      this.rethrowAuthError(error);
      throw error;
    }
  }

  private buildBranchMap(branches: CrowdinBranch[]) {
    const branchMap = new Map<number, string>();
    branchMap.set(0, "");
    for (const branch of branches) {
      branchMap.set(branch.id, branch.name);
    }
    return branchMap;
  }

  private buildDirectoryPaths(
    directories: Array<{ id: number; directoryId: number | null; name: string }>,
    directoryPathById: Map<number, string>,
  ): void {
    const infoById = new Map<number, { directoryId: number | null; name: string }>();
    for (const directory of directories) {
      infoById.set(directory.id, { directoryId: directory.directoryId, name: directory.name });
    }

    for (const directory of directories) {
      directoryPathById.set(directory.id, this.resolveDirectoryPath(directory.id, infoById));
    }
  }

  private resolveDirectoryPath(
    directoryId: number,
    infoById: Map<number, { directoryId: number | null; name: string }>,
  ): string {
    const parts: string[] = [];
    let currentId: number | null = directoryId;
    const visited = new Set<number>();

    while (currentId !== null) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const info = infoById.get(currentId);
      if (!info) break;
      parts.unshift(info.name);
      currentId = info.directoryId;
    }

    return parts.length > 0 ? `${parts.join("/")}/` : "";
  }

  private sourcePathOf(
    file: { branchId: number | null; directoryId: number | null; name: string },
    branchMap: Map<number, string>,
    directoryPathById: Map<number, string>,
  ): string {
    const branchName = file.branchId ? (branchMap.get(file.branchId) ?? "") : "";
    const directoryPath = file.directoryId ? (directoryPathById.get(file.directoryId) ?? "") : "";
    return branchName
      ? `${branchName}/${directoryPath}${file.name}`
      : `${directoryPath}${file.name}`;
  }

  private webOrigin(baseUrl: string | null): string {
    const url = new URL(baseUrl ?? "https://api.crowdin.com/api/v2");
    if (url.hostname === "api.crowdin.com") {
      url.hostname = "crowdin.com";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/g, "");
  }

  private async loadLocaleReadiness(
    client: CrowdinApiClient,
    projectId: number,
    languageIds?: string[],
  ): Promise<Record<string, unknown>> {
    try {
      const progress = await client.listProjectLanguageProgress(projectId, { languageIds });
      return this.mapLanguageProgressToLocaleReadiness(progress);
    } catch {
      // Translation progress is best-effort; do not fail task sync if it is unavailable.
      return {};
    }
  }

  private mapTaskTypeToKind(
    taskType: number,
  ): "translation" | "research" | "review" | "sync" | "asset_management" {
    switch (taskType) {
      case 0:
      case 2:
        return "translation";
      case 1:
      case 3:
        return "review";
      default:
        return "translation";
    }
  }

  private async resolveBranchId(
    client: CrowdinApiClient,
    projectId: number,
    branch?: string | null,
  ): Promise<Result<number | null, { code: "crowdin_branch_not_found" }>> {
    const normalizedBranch = branch?.trim();
    if (!normalizedBranch) {
      return ok(null);
    }

    const branches = await client.listBranches(projectId);
    const match = branches.find((item) => item.name === normalizedBranch);
    if (!match) {
      return err({ code: "crowdin_branch_not_found" });
    }
    return ok(match.id);
  }

  private async ensureDirectory(
    client: CrowdinApiClient,
    projectId: number,
    branchId: number | null,
    segments: string[],
  ) {
    let parentId: number | null = null;
    for (const segment of segments) {
      const directories = await client.listDirectories(projectId, branchId ?? undefined);
      const existing = this.findDirectory(directories, parentId, segment);
      if (existing) {
        parentId = existing.id;
        continue;
      }

      try {
        const created = await client.addDirectory(projectId, {
          name: segment,
          branchId: parentId ? null : branchId,
          directoryId: parentId,
        });
        parentId = created.id;
      } catch (error) {
        if (!(error instanceof CrowdinApiError) || error.status !== 409) {
          throw error;
        }
        const refreshed = await client.listDirectories(projectId, branchId ?? undefined);
        const existingAfterConflict = this.findDirectory(refreshed, parentId, segment);
        if (!existingAfterConflict) {
          throw error;
        }
        parentId = existingAfterConflict.id;
      }
    }

    return parentId;
  }

  private findDirectory(directories: CrowdinDirectory[], parentId: number | null, name: string) {
    return directories.find((directory) => {
      const candidateParent = directory.directoryId ?? null;
      return candidateParent === parentId && directory.name === name;
    });
  }
}

/** Shared Crowdin TMS provider instance registered in the provider registry. */
export const crowdinTmsProvider = new CrowdinTmsProvider();
