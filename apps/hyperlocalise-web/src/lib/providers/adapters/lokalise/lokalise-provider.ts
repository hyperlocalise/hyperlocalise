import type {
  ProjectFileCatComment,
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
  buildHyperlocaliseFindingMarker,
  parseHyperlocaliseFindingMarker,
} from "@/lib/providers/adapters/smartling/smartling-provider";
import {
  providerFileFormat,
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import type { ExternalTmsGlossaryMatcherInput } from "@/lib/providers/contracts/glossary-matcher";
import { normalizeProviderGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
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
import type {
  ExternalTmsApprovedTranslationUpload,
  ExternalTmsContentPuller,
  ExternalTmsFileKeyFetcher,
} from "@/lib/providers/jobs/tms-provider-types";
import type { ExternalTmsCommentPusher } from "@/lib/providers/shared/provider-feedback-types";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live-error";
import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import type {
  ProviderReviewAuthor,
  ProviderReviewThread,
} from "@/lib/providers/provider-job-review/types";
import {
  pixelRectToPercentMarkers,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

import {
  buildLokaliseKeyCommentProviderUrl,
  buildLokaliseProjectUrl,
  buildLokaliseTaskUrl,
  collectLokaliseTaskAssignees,
  collectLokaliseTaskKeyIds,
  collectLokaliseTaskTargetLocales,
  extractLokaliseKeyName,
  getLokaliseTaskCompletionMs,
  inferFormatFromFilename,
  listLokaliseFilenameEntries,
  LOKALISE_COMPLETED_TASK_MAX_PAGES,
  LOKALISE_DEFAULT_BASE_URL,
  LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
  LOKALISE_RECENT_COMPLETED_WINDOW_MS,
  LOKALISE_TM_SYNC_MAX_KEYS,
  LokaliseApiClient,
  LokaliseApiError,
  partitionLokaliseLocales,
  parseLokaliseExternalJobId,
  parseLokaliseTaskDueDate,
  summarizeLokaliseBulkUpdateChunkResult,
  type LokaliseBulkUpdateKey,
  type LokaliseComment,
  type LokaliseGlossaryTerm,
  type LokaliseKey,
  type LokaliseLanguage,
  type LokaliseTask,
  type LokaliseTranslation,
} from "./lokalise-api";

export {
  LOKALISE_OAUTH_SCOPE_GUIDE,
  LOKALISE_OAUTH_SCOPES,
  getLokaliseOAuthScopeString,
  type LokaliseOAuthScopeGuideEntry,
} from "@/lib/providers/adapters/lokalise/lokalise-oauth-scopes";

/**
 * Lokalise TMS provider adapter.
 *
 * Implements {@link TmsProvider} against the Lokalise REST API. Hyperlocalise jobs map to
 * Lokalise **tasks**; strings are modeled as **keys** with optional per-platform filenames.
 *
 * Unlike Crowdin, Lokalise exposes both file- and key-level CAT resources. Glossary and
 * translation memory are synthesized from project glossary terms and key translations
 * rather than separate TM/glossary APIs during sync.
 *
 * Live CAT queue loading supports tag/search filtering with resumable scan cursors when
 * client-side filtering is required.
 */

const implemented = { state: "implemented" } as const satisfies TmsProviderFeature;
const unsupported = { state: "unsupported" } as const satisfies TmsProviderFeature;

const LOCALE_FETCH_CONCURRENCY = 15;
const LOKALISE_OPEN_TASK_STATUSES = ["created", "queued", "in_progress"] as const;
const KEY_ID_CHUNK_SIZE = 100;
const LOKALISE_EXPORT_ARTIFACT_METADATA_MAX_BYTES = 5 * 1024 * 1024;
const BULK_UPDATE_CHUNK_SIZE = 50;
const lokaliseScreenshotDetailConcurrency = 5;
const LOKALISE_KEY_FETCH_CHUNK_SIZE = 50;
const LOKALISE_QUEUE_SCAN_PAGE_SIZE = 100;
const LOKALISE_MAX_SCAN_PAGES = 50;

/** Typed error surfaced by live CAT operations when Lokalise auth or input validation fails. */
export class LokaliseLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LokaliseLiveCatError";
  }
}

/**
 * Lokalise implementation of the shared TMS provider contract.
 *
 * Use the exported singleton {@link lokaliseTmsProvider} in production code.
 */
export class LokaliseTmsProvider extends TmsProvider {
  readonly kind = "lokalise" as const;
  readonly label = "Lokalise";

  readonly auth = {
    workspaceCredential: true,
    userConnection: true,
    note: "Workspace credentials hold the integration; user-facing actions can use Lokalise user connections.",
  };

  readonly resourceSupport = {
    providerCat: {
      file: true,
      key: true,
    },
  };

  readonly features = {
    "projects.read": implemented,
    "projects.write": unsupported,
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
    "write_back.source": unsupported,
    "write_back.translation": implemented,
    "cat.open": implemented,
    "cat.visual_context": implemented,
    "auth.user_scoped": implemented,
  } satisfies Record<TmsProviderFeatureId, TmsProviderFeature>;

  /** Builds an authenticated {@link LokaliseApiClient} from provider scope credentials. */
  private createClient(input: {
    credential: { baseUrl?: string | null };
    secretMaterial: string;
    fetchFn?: typeof fetch;
  }) {
    return new LokaliseApiClient({
      token: input.secretMaterial,
      baseUrl: input.credential.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
      fetchFn: input.fetchFn,
    });
  }

  /** Lists Lokalise projects and enriches each with locale metadata when available. */
  async fetchProjects(context: TmsProviderContext) {
    const client = this.createClient(context);

    let projects;
    try {
      projects = await client.listProjects();
    } catch (error) {
      if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    return mapWithConcurrency(projects, LOCALE_FETCH_CONCURRENCY, async (project) => {
      try {
        const languages = await client.listProjectLanguages(project.projectId);
        const { sourceLocale, targetLocales } = partitionLokaliseLocales(project, languages);

        return {
          externalProjectId: project.projectId,
          name: project.name,
          sourceLocale,
          targetLocales,
          externalProjectUrl: buildLokaliseProjectUrl(project.projectId),
          isActive: true,
          metadata: {
            projectType: project.projectType,
            teamId: project.teamId,
            description: project.description,
            baseLanguageId: project.baseLanguageId,
            languages: languages.map((language) => ({
              id: language.langId,
              iso: language.langIso,
              name: language.langName,
              isRtl: language.isRtl,
            })),
          },
        };
      } catch (error) {
        if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
          throw new Error("lokalise_auth_invalid");
        }

        return {
          externalProjectId: project.projectId,
          name: project.name,
          sourceLocale: project.baseLanguageIso,
          targetLocales: [],
          externalProjectUrl: buildLokaliseProjectUrl(project.projectId),
          isActive: true,
          metadata: {
            projectType: project.projectType,
            teamId: project.teamId,
            description: project.description,
            baseLanguageId: project.baseLanguageId,
            syncWarning: error instanceof Error ? error.message : "locale_fetch_failed",
          },
        };
      }
    });
  }

  /**
   * Lists open and recently completed Lokalise tasks as Hyperlocalise jobs.
   *
   * Completed tasks are limited to a recent time window to keep sync payloads bounded.
   */
  async fetchJobTasks(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);

    let tasks: LokaliseTask[];
    try {
      tasks = await listOpenAndRecentLokaliseTasks(client, scope.externalProjectId);
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 401) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    return tasks.map((task) => {
      const completedAtMs = getLokaliseTaskCompletionMs(task);

      return {
        externalJobId: String(task.taskId),
        externalTaskId: null,
        externalStatus: task.status,
        title: task.title,
        dueDate: parseLokaliseTaskDueDate(task),
        targetLocales: collectLokaliseTaskTargetLocales(task),
        assignedUsers: collectLokaliseTaskAssignees(task),
        externalUrl: buildLokaliseTaskUrl(scope.externalProjectId, task.taskId),
        completedAt: completedAtMs != null ? new Date(completedAtMs).toISOString() : null,
        providerPayload: {
          taskType: task.taskType,
          description: task.description,
          progress: task.progress,
          sourceLanguageIso: task.sourceLanguageIso,
          keysCount: task.keysCount,
          wordsCount: task.wordsCount,
          languages: task.languages.map((language) => ({
            languageIso: language.languageIso,
            languageName: language.languageName,
            status: language.status,
            progress: language.progress,
          })),
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        },
        kind: mapLokaliseTaskKind(task.taskType),
      };
    });
  }

  /**
   * Discovers file- and key-level resources for a Lokalise project.
   *
   * Files are aggregated from key filename entries per platform; keys are also exported as
   * individual resources with locale readiness derived from embedded translations.
   */
  async fetchFileKeys(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);
    if (!scope.externalProjectId.trim()) {
      throw new Error("invalid_lokalise_project_id");
    }

    let keys;
    let languages;
    try {
      [keys, languages] = await Promise.all([
        client.listKeys(scope.externalProjectId, { includeTranslations: true }),
        client.listProjectLanguages(scope.externalProjectId),
      ]);
    } catch (error) {
      throw mapLokaliseFetcherError(error);
    }

    const projectMetadata = readProjectMetadata(scope.project);
    const baseLanguageId =
      typeof projectMetadata.baseLanguageId === "number" ? projectMetadata.baseLanguageId : null;
    const sourceLocale =
      scope.project.sourceLocale?.trim() ||
      languages.find((language) => language.langId === baseLanguageId)?.langIso.trim() ||
      null;
    const targetLocales =
      scope.project.targetLocales.length > 0
        ? scope.project.targetLocales
        : languages
            .filter((language) => {
              if (baseLanguageId != null) {
                return language.langId !== baseLanguageId;
              }
              if (sourceLocale) {
                return language.langIso.trim() !== sourceLocale;
              }
              return false;
            })
            .map((language) => language.langIso.trim())
            .filter((locale): locale is string => Boolean(locale));

    const externalUrl = buildLokaliseProjectUrl(scope.externalProjectId);
    const filesByResourceId = new Map<string, DiscoveredFile>();

    for (const key of keys) {
      for (const entry of listLokaliseFilenameEntries(key.filenames)) {
        const resourceId = buildLokaliseFileExternalResourceId(entry.platform, entry.filename);
        const existing = filesByResourceId.get(resourceId);
        if (existing) {
          existing.keyIds.add(key.keyId);
          for (const tag of key.tags) {
            existing.tags.add(tag);
          }
          existing.revision = pickLatestRevision(
            existing.revision,
            key.translationsModifiedAt ?? key.modifiedAt,
          );
          continue;
        }

        filesByResourceId.set(resourceId, {
          platform: entry.platform,
          filename: entry.filename,
          format: inferFormatFromFilename(entry.filename),
          tags: new Set(key.tags),
          keyIds: new Set([key.keyId]),
          revision: key.translationsModifiedAt ?? key.modifiedAt,
        });
      }
    }

    const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];
    const keyById = new Map(keys.map((key) => [key.keyId, key]));

    for (const file of filesByResourceId.values()) {
      const scopedKeys = [...file.keyIds]
        .map((id) => keyById.get(id))
        .filter((key): key is LokaliseKey => key != null);
      results.push({
        externalResourceId: buildLokaliseFileExternalResourceId(file.platform, file.filename),
        resourceType: "file",
        sourcePath: buildLokaliseFileSourcePath(sourceLocale, file.platform, file.filename),
        displayName: file.filename,
        format: file.format,
        sourceLocale,
        targetLocales,
        revision: file.revision,
        externalUrl,
        syncState: "synced",
        localeReadiness: buildFileLocaleReadiness({
          keys: scopedKeys,
          targetLocales,
        }),
        providerPayload: {
          platform: file.platform,
          filename: file.filename,
          tags: [...file.tags],
          keyIds: [...file.keyIds],
          bundleDownload: {
            bundleStructure: LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
            format: file.format,
            filterLangs: targetLocales,
            originalFilenames: false,
          },
        },
      });
    }

    for (const key of keys) {
      const keyName = extractLokaliseKeyName(key.keyName);
      if (!keyName) {
        continue;
      }

      const primaryFilename = pickPrimaryFilename(key);
      results.push({
        externalResourceId: buildLokaliseKeyExternalResourceId(key.keyId),
        resourceType: "key",
        sourcePath: buildLokaliseKeySourcePath(keyName, primaryFilename),
        displayName: keyName,
        format: primaryFilename ? inferFormatFromFilename(primaryFilename) : null,
        sourceLocale,
        targetLocales,
        revision: key.translationsModifiedAt ?? key.modifiedAt,
        externalUrl,
        syncState: "synced",
        localeReadiness: buildKeyLocaleReadiness({
          key,
          targetLocales,
        }),
        providerPayload: {
          id: key.keyId,
          key: keyName,
          name: keyName,
          description: key.description,
          context: key.context,
          platforms: key.platforms,
          filenames: buildNonEmptyFilenamesPayload(key.filenames),
          tags: key.tags,
          isPlural: key.isPlural,
          isHidden: key.isHidden,
          isArchived: key.isArchived,
          createdAt: key.createdAt,
          modifiedAt: key.modifiedAt,
          translationsModifiedAt: key.translationsModifiedAt,
        },
      });
    }

    return results;
  }

  /**
   * Imports the project glossary as one logical glossary per target locale.
   *
   * Terms are read from Lokalise glossary API and split into locale-specific sync rows.
   */
  async fetchGlossaries(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);

    const projectId = scope.externalProjectId.trim();
    if (!projectId) {
      throw new Error("invalid_lokalise_project_id");
    }
    let terms;
    let languages;
    try {
      [terms, languages] = await Promise.all([
        client.listGlossaryTerms(projectId),
        client.listProjectLanguages(projectId),
      ]);
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 401) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale?.trim() || languages[0]?.langIso || "en";
    const baseLanguageId =
      typeof scope.project.providerMetadata?.baseLanguageId === "number"
        ? scope.project.providerMetadata.baseLanguageId
        : null;
    const { targetLocales } = partitionLokaliseLocales(
      {
        baseLanguageId,
        baseLanguageIso: sourceLocale,
      },
      languages,
    );
    const glossaryTargetLocales =
      targetLocales.length > 0
        ? uniqueLocales(targetLocales)
        : uniqueLocales(scope.project.targetLocales ?? []);

    if (glossaryTargetLocales.length === 0) {
      glossaryTargetLocales.push(sourceLocale);
    }

    const languageIsoById = new Map(
      languages
        .filter((language) => language.langId > 0 && language.langIso.trim())
        .map((language) => [language.langId, language.langIso.trim()] as const),
    );

    const externalGlossaryId = buildLokaliseProjectGlossaryExternalId(projectId);
    const glossaryName = `Lokalise glossary (${projectId})`;

    return glossaryTargetLocales.map((targetLocale) => {
      const localeTerms = terms.flatMap((term) => {
        const sourceTerm = term.term.trim();
        const targetTerm = pickLokaliseGlossaryTranslation(term, targetLocale, languageIsoById);
        if (!sourceTerm || !targetTerm) {
          return [];
        }

        return [
          {
            externalKey: String(term.id),
            sourceTerm,
            targetTerm,
            description: term.description ?? undefined,
            status: term.forbidden ? "forbidden" : null,
            forbidden: term.forbidden,
            metadata: {
              lokaliseGlossaryTermId: term.id,
              caseSensitive: term.caseSensitive,
              translatable: term.translatable,
              tags: term.tags,
              targetLocale,
              translationLocales: term.translations
                .map((translation) =>
                  resolveLokaliseGlossaryTranslationLocale(translation, languageIsoById),
                )
                .filter((locale): locale is string => Boolean(locale)),
            },
          },
        ];
      });

      return {
        externalGlossaryId,
        name: glossaryName,
        description: "Project glossary synced from Lokalise",
        sourceLocale,
        targetLocale,
        externalResourceType: "glossary" as const,
        localeCoverage: uniqueLocales([sourceLocale, ...glossaryTargetLocales]),
        termCount: localeTerms.length,
        termCapabilities: { mode: "synced_import", search: true },
        metadata: {
          lokaliseProjectId: projectId,
          lokaliseGlossaryKind: "project_glossary",
        },
        externalUrl: buildLokaliseProjectUrl(projectId),
        terms: localeTerms,
      };
    });
  }

  /**
   * Builds a synthetic translation memory from project key translations.
   *
   * Scans up to {@link LOKALISE_TM_SYNC_MAX_KEYS} keys with translations included.
   */
  async fetchTranslationMemories(scope: TmsProviderProjectScope) {
    const client = this.createClient(scope);

    const projectId = scope.externalProjectId.trim();
    if (!projectId) {
      throw new Error("invalid_lokalise_project_id");
    }
    let keys;
    let languages;
    try {
      [keys, languages] = await Promise.all([
        client.listKeys(projectId, {
          includeTranslations: true,
          maxKeys: LOKALISE_TM_SYNC_MAX_KEYS,
        }),
        client.listProjectLanguages(projectId),
      ]);
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 401) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale?.trim() || languages[0]?.langIso || "en";
    const baseLanguageId =
      typeof scope.project.providerMetadata?.baseLanguageId === "number"
        ? scope.project.providerMetadata.baseLanguageId
        : null;
    const { targetLocales } = partitionLokaliseLocales(
      {
        baseLanguageId,
        baseLanguageIso: sourceLocale,
      },
      languages,
    );
    const memoryTargetLocales =
      targetLocales.length > 0
        ? uniqueLocales(targetLocales)
        : uniqueLocales(scope.project.targetLocales ?? []);

    const entries = [];

    for (const key of keys) {
      const sourceTranslation = pickLokaliseKeyTranslation(key, sourceLocale);
      if (!sourceTranslation?.translation.trim()) {
        continue;
      }

      const sourceText = sourceTranslation.translation.trim();
      for (const targetLocale of memoryTargetLocales) {
        const targetTranslation = pickLokaliseKeyTranslation(key, targetLocale);
        const targetText = targetTranslation?.translation.trim();
        if (!targetText) {
          continue;
        }

        entries.push({
          externalKey: `${key.keyId}:${targetLocale}`,
          sourceLocale,
          targetLocale,
          sourceText,
          targetText,
          metadata: {
            lokaliseKeyId: key.keyId,
            lokaliseKeyName: extractLokaliseKeyName(key.keyName),
          },
        });
      }
    }

    return [
      {
        externalMemoryId: buildLokaliseProjectTranslationMemoryExternalId(projectId),
        name: `Lokalise translation memory (${projectId})`,
        description: "Project key scope.translations used as translation memory segments",
        sourceLocale,
        localeCoverage: uniqueLocales([sourceLocale, ...memoryTargetLocales]),
        segmentCount: entries.length,
        metadata: {
          lokaliseProjectId: projectId,
          lokaliseTranslationMemoryKind: "project_keys",
          scannedKeyCount: keys.length,
        },
        externalUrl: buildLokaliseProjectUrl(projectId),
        entries,
      },
    ];
  }

  /**
   * Pulls task-scoped keys, translations, and optional bundle export metadata.
   *
   * When the task lists explicit key ids, only those keys are fetched; otherwise all project
   * keys are loaded.
   */
  async pullTaskContent(scope: TmsProviderJobScope) {
    const client = this.createClient(scope);

    const projectId = scope.externalProjectId.trim();
    if (!projectId) {
      throw new Error("invalid_lokalise_project_id");
    }

    const parsedJobId = parseLokaliseExternalJobId(scope.externalJobId);
    if (!parsedJobId) {
      throw new Error("invalid_lokalise_job_id");
    }
    let task;
    try {
      task = await client.getTask(projectId, parsedJobId.taskId);
    } catch (error) {
      throw mapLokaliseFetcherError(error);
    }

    const sourceLocale =
      task.sourceLanguageIso?.trim() || scope.project.sourceLocale?.trim() || null;
    const targetLocales = collectLokaliseTaskTargetLocales(task);
    if (targetLocales.length === 0) {
      throw new Error("lokalise_task_missing_target_language");
    }

    const taskKeyIds = collectLokaliseTaskKeyIds(task);
    let keys: LokaliseKey[];
    try {
      keys =
        taskKeyIds.length > 0
          ? await listKeysByIds(client, projectId, taskKeyIds)
          : await client.listKeys(projectId, { includeTranslations: true });
    } catch (error) {
      throw mapLokaliseFetcherError(error);
    }

    const units: Awaited<ReturnType<ExternalTmsContentPuller>>["units"] = keys.map((key) => {
      const keyName = extractLokaliseKeyName(key.keyName);
      const translationsByLocale = new Map(
        key.translations.map((translation) => [translation.languageIso, translation]),
      );
      const sourceTranslation = sourceLocale ? translationsByLocale.get(sourceLocale) : null;
      const sourceText = sourceTranslation?.translation?.trim() || keyName;
      const primaryFilename = pickPrimaryFilename(key);

      const targetEntries = targetLocales.flatMap((locale) => {
        const translation = translationsByLocale.get(locale);
        if (!translation?.translation?.trim()) {
          return [];
        }

        const readiness = mapLokaliseTranslationReadiness({
          content: translation.translation,
          isUnverified: translation.isUnverified,
          isReviewed: translation.isReviewed,
          isArchived: key.isArchived,
          isHidden: key.isHidden,
        });

        return [
          {
            locale,
            text: translation.translation.trim(),
            externalTranslationId: String(translation.translationId),
            isApproved: readiness === "ready",
          },
        ];
      });

      return {
        externalStringId: String(key.keyId),
        key: keyName,
        sourceText,
        context: key.context ?? key.description,
        fileId: primaryFilename,
        translations: targetEntries,
        providerPayload: {
          tags: key.tags,
          platforms: key.platforms,
          filenames: buildNonEmptyFilenamesPayload(key.filenames),
          isPlural: key.isPlural,
          isHidden: key.isHidden,
          isArchived: key.isArchived,
        },
      };
    });

    let exportArtifact: Awaited<ReturnType<ExternalTmsContentPuller>>["exportArtifact"] = null;
    try {
      const format = inferPrimaryFormat(keys) ?? "json";
      const download = await client.requestFileDownload(projectId, {
        format,
        originalFilenames: false,
        bundleStructure: LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
        filterLangs: [...new Set([...(sourceLocale ? [sourceLocale] : []), ...targetLocales])],
      });
      const byteLength = await client.getDownloadByteLength(
        download.bundleUrl,
        LOKALISE_EXPORT_ARTIFACT_METADATA_MAX_BYTES,
      );
      exportArtifact = {
        url: download.bundleUrl,
        format,
        byteLength,
      };
    } catch {
      // File export is best-effort for agent workflows.
    }

    return {
      externalJobId: scope.externalJobId,
      externalTaskId: String(task.taskId),
      sourceLocale,
      targetLocales,
      units,
      exportArtifact,
      providerPayload: {
        taskId: task.taskId,
        status: task.status,
        title: task.title,
        taskType: task.taskType,
        keysCount: task.keysCount,
        wordsCount: task.wordsCount,
        keyIds: taskKeyIds,
      },
    };
  }

  /**
   * Uploads a source file to Lokalise and returns the async process id.
   *
   * Requires explicit file format and resolvable source locale.
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
    const format = providerFileFormat(scope.file);
    if (!format) {
      return err({ code: "lokalise_source_file_format_required" });
    }

    const sourceLocale = scope.file.sourceLocale?.trim() || scope.project.sourceLocale?.trim();
    if (!sourceLocale) {
      return err({ code: "lokalise_source_locale_required" });
    }

    const result = await client.uploadSourceFile(scope.externalProjectId, {
      filename: providerFilename(scope.file),
      content: scope.file.content,
      sourceLocale,
      format,
      branch: scope.file.branch,
    });

    return ok({
      sourcePath,
      externalResourceId: result.processId,
      revision: null,
      asyncOperation: {
        provider: "lokalise",
        processId: result.processId,
        status: result.status,
        type: result.type,
      },
      providerPayload: {
        processId: result.processId,
        status: result.status,
        type: result.type,
        message: result.message,
        sourceLocale,
        format,
        branch: scope.file.branch?.trim() || null,
      },
    });
  }

  /**
   * Writes approved translations via Lokalise bulk key update API.
   *
   * Batches updates in chunks of {@link BULK_UPDATE_CHUNK_SIZE}. Resolves default target
   * locale from the linked task when translations omit locale.
   */
  async pushTranslations(scope: TmsProviderPushTranslationsScope) {
    const client = this.createClient(scope);

    const projectId = scope.externalProjectId.trim();
    if (!projectId) {
      throw new Error("invalid_lokalise_project_id");
    }

    const parsedJobId = parseLokaliseExternalJobId(scope.externalJobId);
    if (!parsedJobId) {
      throw new Error("invalid_lokalise_job_id");
    }
    let defaultTargetLocale: string | null = null;
    let taskTargetLocales: string[] = [];
    try {
      const task = await client.getTask(projectId, parsedJobId.taskId);
      taskTargetLocales = collectLokaliseTaskTargetLocales(task);
      defaultTargetLocale = taskTargetLocales[0] ?? null;
    } catch (error) {
      throw mapLokaliseFetcherError(error);
    }

    const { batches, failures: payloadFailures } = buildLokaliseTranslationWriteBackBatches({
      translations: scope.translations,
      defaultTargetLocale,
      taskTargetLocales,
    });

    let uploaded = 0;
    let failed = payloadFailures.length;
    const failures = [...payloadFailures];
    const asyncOperations: Array<Record<string, unknown>> = [];

    for (let index = 0; index < batches.length; index += BULK_UPDATE_CHUNK_SIZE) {
      const chunk = batches.slice(index, index + BULK_UPDATE_CHUNK_SIZE);
      try {
        const response = await client.bulkUpdateKeys(projectId, chunk);
        const chunkResult = summarizeLokaliseBulkUpdateChunkResult(chunk, response);
        uploaded += chunkResult.uploaded;
        failed += chunkResult.failed;
        failures.push(...chunkResult.failures);

        asyncOperations.push({
          type: "lokalise_bulk_update_keys",
          keysRequested: chunk.length,
          keysUpdated: response.keys?.length ?? 0,
          keysFailed: chunkResult.failedKeyCount,
          status:
            chunkResult.failed > 0
              ? chunkResult.uploaded > 0
                ? "partial"
                : "failed"
              : "succeeded",
        });
      } catch (error) {
        failed += chunk.reduce((count, batch) => count + batch.translations.length, 0);
        const message =
          error instanceof Error ? error.message : "lokalise_translation_upload_failed";
        for (const batch of chunk) {
          for (const translation of batch.translations) {
            failures.push({
              locale: translation.languageIso,
              fileId: null,
              message,
            });
          }
        }
        asyncOperations.push({
          type: "lokalise_bulk_update_keys",
          keysRequested: chunk.length,
          status: "failed",
          error: message,
        });
      }
    }

    return { uploaded, failed, failures, asyncOperations };
  }

  /** Live glossary matching against project glossary terms already known to Hyperlocalise. */
  async searchGlossaryMatches(input: ExternalTmsGlossaryMatcherInput) {
    const client = this.createClient({
      credential: input.credential,
      secretMaterial: input.secretMaterial,
    });

    const projectId = input.externalProjectId.trim();
    if (!projectId) {
      return [];
    }

    const expectedExternalGlossaryId = buildLokaliseProjectGlossaryExternalId(projectId);
    const normalizedTargetLocale = input.targetLocale.trim().toLowerCase();
    const glossary = input.glossaries.find((candidate) => {
      if (candidate.externalGlossaryId !== expectedExternalGlossaryId) {
        return false;
      }

      const candidateTargetLocale = candidate.targetLocale?.trim().toLowerCase();
      return !candidateTargetLocale || candidateTargetLocale === normalizedTargetLocale;
    });
    if (!glossary) {
      return [];
    }

    let terms;
    let languages;
    try {
      [terms, languages] = await Promise.all([
        client.listGlossaryTerms(projectId),
        client.listProjectLanguages(projectId),
      ]);
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 401) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    const languageIsoById = new Map(
      languages
        .filter((language) => language.langId > 0 && language.langIso.trim())
        .map((language) => [language.langId, language.langIso.trim()] as const),
    );

    const liveMatches = [];

    for (const [index, term] of terms.entries()) {
      if (!matchesLokaliseGlossaryTerm(input.sourceText, term)) {
        continue;
      }

      const sourceTerm = term.term.trim();
      const targetTerm = pickLokaliseGlossaryTranslation(term, input.targetLocale, languageIsoById);
      if (!sourceTerm || !targetTerm) {
        continue;
      }

      liveMatches.push(
        normalizeProviderGlossaryMatch({
          sourceTerm,
          targetTerm,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          description: term.description,
          caseSensitive: term.caseSensitive,
          providerKind: "lokalise",
          resourceId: glossary.id,
          externalResourceId: expectedExternalGlossaryId,
          externalTermId: String(term.id),
          glossaryName: glossary.name,
          rank: Math.max(0, 1 - index * 0.01),
          status: {
            forbidden: term.forbidden,
          },
        }),
      );
    }

    return liveMatches.toSorted((left, right) => right.rank - left.rank).slice(0, input.limit);
  }

  /** Live TM matching using fuzzy text scoring over project key translation pairs. */
  async searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    const client = this.createClient({
      credential: input.credential,
      secretMaterial: input.secretMaterial,
    });

    const projectId = input.externalProjectId.trim();
    if (!projectId) {
      return [];
    }

    const expectedExternalMemoryId = buildLokaliseProjectTranslationMemoryExternalId(projectId);
    if (
      !input.memory.externalMemoryId ||
      input.memory.externalMemoryId !== expectedExternalMemoryId
    ) {
      return [];
    }

    let allKeys;
    try {
      allKeys = await client.listKeys(projectId, { includeTranslations: true });
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 401) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    const keys = allKeys.slice(0, LOKALISE_TM_SYNC_MAX_KEYS);
    const candidates = buildLokaliseTranslationMemorySegmentCandidates(keys, {
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
        providerKind: "lokalise",
        resourceId: input.memory.id,
        externalResourceId: expectedExternalMemoryId,
        externalSegmentId: String(candidate.keyId),
        memoryName: input.memory.name,
        rank: Math.max(0, 1 - index * 0.01),
      }),
    );
  }
  /**
   * Pulls key comments for task-scoped keys into a normalized provider review report.
   *
   * Accepts optional `fetchFn` for test injection.
   */
  async pullReview(scope: TmsProviderPullReviewScope & { fetchFn?: typeof fetch }) {
    const client = this.createClient({
      credential: scope.credential,
      secretMaterial: scope.secretMaterial,
      fetchFn: scope.fetchFn,
    });

    const projectId = scope.externalProjectId.trim();
    const parsedJobId = parseLokaliseExternalJobId(scope.externalJobId);
    if (!projectId || !parsedJobId) {
      throw new Error("invalid_lokalise_project_or_task_id");
    }
    let task: Awaited<ReturnType<typeof client.getTask>>;
    try {
      task = await client.getTask(projectId, parsedJobId.taskId);
    } catch (error) {
      rethrowLokaliseAuthError(error);
    }

    const stringKeyById = new Map(
      scope.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
    );

    const keyIds = new Set<number>();
    for (const unit of scope.content.units) {
      const keyId = Number(unit.externalStringId);
      if (!Number.isNaN(keyId) && keyId > 0) {
        keyIds.add(keyId);
      }
    }

    for (const keyId of collectLokaliseTaskKeyIds(task)) {
      keyIds.add(keyId);
    }

    const keyIdList = [...keyIds];
    const comments: Awaited<ReturnType<typeof client.listKeyComments>> = [];

    if (keyIdList.length === 0) {
      return buildProviderReviewReport([]);
    }

    try {
      for (const chunk of chunkArray(keyIdList, 25)) {
        const chunkResults = await Promise.all(
          chunk.map((keyId) => client.listKeyComments(projectId, keyId)),
        );
        for (const keyComments of chunkResults) {
          comments.push(...keyComments);
        }
      }
    } catch (error) {
      rethrowLokaliseAuthError(error);
    }

    const threads = comments.map((comment) =>
      normalizeLokaliseKeyCommentToThread({
        comment,
        externalProjectId: scope.externalProjectId,
        externalJobId: scope.externalJobId,
        stringKeyById,
      }),
    );

    const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));

    return buildProviderReviewReport([...deduped.values()]);
  }

  /**
   * Pushes QA findings to Lokalise as key comments tagged with Hyperlocalise finding markers.
   *
   * Skips findings whose marker already exists remotely or in `knownExternalIds`.
   */
  async pushComments(scope: TmsProviderCommentPushScope) {
    const client = new LokaliseApiClient({
      token: scope.secretMaterial,
      baseUrl: LOKALISE_DEFAULT_BASE_URL,
    });

    const projectId = scope.externalProjectId.trim();
    if (!projectId) {
      throw new Error("invalid_lokalise_project_id");
    }
    const locales = new Set(
      scope.feedback.map((item) => item.finding.item.locale?.trim()).filter(Boolean),
    );
    const defaultLocaleId = locales.size === 1 ? ([...locales][0] ?? null) : null;

    const { entries, failures: validationFailures } = buildLokaliseCommentWriteBackEntries({
      findings: scope.feedback.map((item) => item.finding),
      defaultLocaleId,
    });

    const entryByFindingId = new Map(entries.map((entry) => [entry.findingId, entry]));
    const changedItems: Awaited<ReturnType<ExternalTmsCommentPusher>>["changedItems"] = [];
    const failures = [...validationFailures];
    let posted = 0;
    let skipped = 0;
    let failed = validationFailures.length;

    const keyIds = [...new Set(entries.map((entry) => entry.request.keyId))];
    const remoteCommentIdsByFindingId = new Map<string, string>();

    if (keyIds.length > 0) {
      try {
        for (const keyId of keyIds) {
          const remoteComments = await client.listKeyComments(projectId, keyId);
          for (const remoteComment of remoteComments) {
            const findingId = parseHyperlocaliseFindingMarker(remoteComment.comment);
            if (findingId) {
              remoteCommentIdsByFindingId.set(findingId, String(remoteComment.commentId));
            }
          }
        }
      } catch (error) {
        if (error instanceof LokaliseApiError && error.status === 401) {
          throw new Error("lokalise_auth_invalid");
        }
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
          hashcode: String(entry.request.keyId),
          locale: entry.request.locale ?? undefined,
          message: "provider_comment_already_exists",
          providerReviewContext: item.providerReviewContext ?? {
            externalProjectId: projectId,
            externalJobId: scope.externalJobId,
            externalThreadId: existingCommentId,
            externalCommentId: existingCommentId,
          },
        });
        continue;
      }

      try {
        const created = await client.createKeyComments(projectId, entry.request.keyId, [
          { comment: entry.request.comment },
        ]);
        const rawCommentId = created[0]?.commentId;
        if (rawCommentId == null || rawCommentId <= 0) {
          throw new Error("lokalise_provider_comment_create_failed");
        }
        const commentId = String(rawCommentId);

        posted += 1;
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "posted",
          externalIssueUid: commentId,
          externalCommentUid: commentId,
          hashcode: String(entry.request.keyId),
          locale: entry.request.locale ?? undefined,
          providerReviewContext: item.providerReviewContext ?? {
            externalProjectId: projectId,
            externalJobId: scope.externalJobId,
            externalThreadId: commentId,
            externalCommentId: commentId,
            providerUrl: buildLokaliseKeyCommentProviderUrl({
              projectId,
              taskId: scope.externalJobId,
              keyId: entry.request.keyId,
              commentId: Number(commentId),
            }),
          },
        });
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "lokalise_provider_comment_create_failed";
        failures.push({ findingId, message });
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "failed",
          hashcode: String(entry.request.keyId),
          locale: entry.request.locale ?? undefined,
          message,
          providerReviewContext: item.providerReviewContext,
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

  /**
   * Live CAT concordance: glossary term scan plus fuzzy TM candidate search.
   *
   * Throws {@link TmsProviderLiveError} on auth or fetch failures.
   */
  async searchCatConcordance(input: {
    client: LokaliseApiClient;
    externalProjectId: string;
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    glossaryLimit?: number;
    translationMemoryLimit?: number;
  }) {
    const projectId = input.externalProjectId.trim();
    if (!projectId) {
      return { glossaryTerms: [], translationMemoryMatches: [] };
    }

    const glossaryLimit = input.glossaryLimit ?? 20;
    const translationMemoryLimit = input.translationMemoryLimit ?? 10;
    const externalGlossaryId = buildLokaliseProjectGlossaryExternalId(projectId);
    const externalMemoryId = buildLokaliseProjectTranslationMemoryExternalId(projectId);
    const glossaryName = `Lokalise glossary (${projectId})`;
    const memoryName = `Lokalise translation memory (${projectId})`;

    let terms: Awaited<ReturnType<LokaliseApiClient["listGlossaryTerms"]>>;
    let languages: Awaited<ReturnType<LokaliseApiClient["listProjectLanguages"]>>;
    let keys: Awaited<ReturnType<LokaliseApiClient["listKeys"]>>;

    try {
      [terms, languages, keys] = await Promise.all([
        input.client.listGlossaryTerms(projectId),
        input.client.listProjectLanguages(projectId),
        input.client.listKeys(projectId, { includeTranslations: true }),
      ]);
    } catch (error) {
      rethrowLokaliseConcordanceApiError(error);
    }

    const languageIsoById = new Map(
      languages
        .filter((language) => language.langId > 0 && language.langIso.trim())
        .map((language) => [language.langId, language.langIso.trim()] as const),
    );

    const glossaryTerms: NormalizedGlossaryMatch[] = [];
    for (const [index, term] of terms.entries()) {
      if (!matchesLokaliseGlossaryTerm(input.sourceText, term)) {
        continue;
      }

      const sourceTerm = term.term.trim();
      const targetTerm = pickLokaliseGlossaryTranslation(term, input.targetLocale, languageIsoById);
      if (!sourceTerm || !targetTerm) {
        continue;
      }

      glossaryTerms.push(
        normalizeProviderGlossaryMatch({
          sourceTerm,
          targetTerm,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          description: term.description,
          caseSensitive: term.caseSensitive,
          providerKind: "lokalise",
          resourceId: externalGlossaryId,
          externalResourceId: externalGlossaryId,
          externalTermId: String(term.id),
          glossaryName,
          rank: 1 - index * 0.01,
          status: {
            forbidden: term.forbidden,
          },
        }),
      );
    }

    const tmCandidates = buildLokaliseTranslationMemorySegmentCandidates(
      keys.slice(0, LOKALISE_TM_SYNC_MAX_KEYS),
      {
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourceText: input.sourceText,
        limit: translationMemoryLimit,
      },
    );

    const translationMemoryMatches = tmCandidates.map((candidate, index) =>
      normalizeProviderTranslationMemoryMatch({
        sourceText: candidate.sourceText,
        targetText: candidate.targetText,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        matchScore: candidate.matchScore,
        providerKind: "lokalise",
        resourceId: externalMemoryId,
        externalResourceId: externalMemoryId,
        externalSegmentId: String(candidate.keyId),
        memoryName,
        rank: 1 - index * 0.01,
      }),
    );

    return {
      glossaryTerms: glossaryTerms
        .toSorted((left, right) => right.rank - left.rank)
        .slice(0, glossaryLimit),
      translationMemoryMatches,
    };
  }

  /** Loads screenshot visual context for a Lokalise key, enriching marker geometry when needed. */
  async loadCatVisualContext(input: {
    client: LokaliseApiClient;
    externalProjectId: string;
    externalStringId: string;
  }) {
    const keyId = Number(input.externalStringId);
    if (Number.isNaN(keyId)) {
      return { screenshots: [] };
    }

    const screenshots = await input.client.listScreenshotsForKey(input.externalProjectId, keyId);
    const withImage = screenshots.filter((screenshot) => screenshot.imageUrl.trim().length > 0);

    const enriched = await mapWithConcurrency(
      withImage,
      lokaliseScreenshotDetailConcurrency,
      async (screenshot) => {
        const hasKeyArea = screenshot.keyAreas.some((area) => area.keyId === keyId);
        if (hasKeyArea || screenshot.screenshotId <= 0) {
          return screenshot;
        }

        return input.client.getScreenshot(input.externalProjectId, screenshot.screenshotId);
      },
    );

    return {
      screenshots: enriched.map((screenshot) => mapLokaliseScreenshot(screenshot, keyId)),
    };
  }

  /** Lists normalized task comments for legacy task-comment consumers. Returns `null` when task missing. */
  async listTaskComments(input: {
    secretMaterial: string;
    baseUrl?: string | null;
    externalProjectId: string;
    externalJobId: string;
  }) {
    const client = new LokaliseApiClient({
      token: input.secretMaterial,
      baseUrl: input.baseUrl ?? undefined,
    });

    const projectId = input.externalProjectId.trim();
    const parsedJobId = parseLokaliseExternalJobId(input.externalJobId);
    if (!projectId || !parsedJobId) {
      return null;
    }
    let task: Awaited<ReturnType<typeof client.getTask>>;
    try {
      task = await client.getTask(projectId, parsedJobId.taskId);
    } catch (error) {
      if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("lokalise_auth_invalid");
      }
      if (error instanceof LokaliseApiError && error.status === 404) {
        return null;
      }
      throw error;
    }

    const keyIds = collectLokaliseTaskKeyIds(task);
    if (keyIds.length === 0) {
      return [];
    }

    const comments: Awaited<ReturnType<typeof client.listKeyComments>> = [];
    try {
      for (const chunk of chunkArray(keyIds, 25)) {
        const chunkResults = await Promise.all(
          chunk.map((keyId) => client.listKeyComments(projectId, keyId)),
        );
        for (const keyComments of chunkResults) {
          comments.push(...keyComments);
        }
      }
    } catch (error) {
      if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    return comments.map((comment) => ({
      id: `lokalise:key-comment:${comment.commentId}`,
      externalCommentId: String(comment.commentId),
      userId: String(comment.addedBy ?? comment.addedByEmail ?? "unknown"),
      taskId: String(parsedJobId.taskId),
      text: comment.comment,
      timeSpentSeconds: null,
      createdAt: comment.addedAt ?? "",
      updatedAt: comment.addedAt ?? "",
    }));
  }

  /** Computes locale readiness percentages from all project keys for dashboard-style summaries. */
  async loadProjectLocaleReadiness(input: {
    client: LokaliseApiClient;
    projectId: string;
    languageId?: string;
  }) {
    let keys: LokaliseKey[];
    let languages: Awaited<ReturnType<LokaliseApiClient["listProjectLanguages"]>>;
    try {
      [keys, languages] = await Promise.all([
        input.client.listKeys(input.projectId, { includeTranslations: true }),
        input.client.listProjectLanguages(input.projectId),
      ]);
    } catch (error) {
      if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("lokalise_auth_invalid");
      }
      throw error;
    }

    const targetLocales = languages
      .map((language) => language.langIso.trim())
      .filter((locale) => locale.length > 0);
    const locales = input.languageId?.trim()
      ? targetLocales.filter((locale) => locale === input.languageId?.trim())
      : targetLocales;

    const localeReadiness: Record<string, unknown> = {};
    for (const locale of locales) {
      const counts = countTranslationState(keys, locale);
      localeReadiness[locale] = this.mapLocaleProgressToReadiness({ locale, counts });
    }

    if (input.languageId?.trim() && localeReadiness[input.languageId.trim()]) {
      return localeReadiness[input.languageId.trim()] as Record<string, unknown>;
    }

    return localeReadiness;
  }

  /** Maps raw translation counts into Crowdin-compatible progress percentage fields. */
  mapLocaleProgressToReadiness(input: {
    locale: string;
    counts: { total: number; translated: number; approved: number };
  }) {
    const phrases = {
      total: input.counts.total,
      translated: input.counts.translated,
      approved: input.counts.approved,
    };

    return {
      translationProgress: toProgressPercent(input.counts.translated, input.counts.total),
      approvalProgress: toProgressPercent(input.counts.approved, input.counts.total),
      words: phrases,
      phrases,
    };
  }

  /** Maps a single Lokalise task language progress value into readiness metadata. */
  mapTaskLanguageProgressToReadiness(input: { languageIso: string; progress: number }) {
    const rounded = Math.max(0, Math.min(100, Math.round(input.progress)));
    return {
      translationProgress: rounded,
      approvalProgress: rounded,
    };
  }

  /** Builds a paginated live CAT queue file for Lokalise file or key resources. */
  async buildLiveCatFile(input: {
    secretMaterial: string;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    canEditTranslations: boolean;
    pagination?: ProjectFileCatPaginationInput;
  }) {
    const scope = resolveLokaliseLiveCatContext({
      file: input.file,
      externalProjectId: input.externalProjectId,
      secretMaterial: input.secretMaterial,
      baseUrl: input.baseUrl,
    });
    const client = new LokaliseApiClient({
      token: scope.token,
      baseUrl: scope.baseUrl,
    });

    let languages: LokaliseLanguage[];
    try {
      languages = await client.listProjectLanguages(scope.projectId);
    } catch (error) {
      mapLokaliseApiError(error);
    }

    resolveLokaliseTargetLocale(input.targetLocale, languages);

    const paginationInput = input.pagination ?? {
      offset: 0,
      limit: legacyProviderCatSegmentLimit,
      search: undefined,
      queueFilter: "all",
      paginated: true,
    };

    const { segments, hasMore, nextPhraseScanPage, nextPhraseScanSkip } =
      await loadLokaliseQueuePage({
        client,
        scope,
        file: input.file,
        paginationInput,
      });

    const pagination = buildCatFilePagination({
      offset: paginationInput.offset,
      limit: paginationInput.limit,
      returnedCount: segments.length,
      totalCount: hasMore
        ? paginationInput.offset + segments.length + 1
        : paginationInput.offset + segments.length,
      hasMore,
      nextPhraseScanPage,
      nextPhraseScanSkip,
    });

    return {
      sourcePath: input.file.sourcePath,
      filename: input.file.filename,
      provider: input.file.provider,
      targetLocale: input.targetLocale,
      canEditTranslations: input.canEditTranslations,
      truncated: pagination.hasMore,
      pagination,
      segments,
    };
  }

  /** Loads the current target translation for one CAT segment, or `"not_found"`. */
  async getLiveCatSegmentTarget(input: {
    secretMaterial: string;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
  }) {
    const scope = resolveLokaliseLiveCatContext({
      file: input.file,
      externalProjectId: input.externalProjectId,
      secretMaterial: input.secretMaterial,
      baseUrl: input.baseUrl,
    });
    const client = new LokaliseApiClient({
      token: scope.token,
      baseUrl: scope.baseUrl,
    });

    let languages: LokaliseLanguage[];
    try {
      languages = await client.listProjectLanguages(scope.projectId);
    } catch (error) {
      mapLokaliseApiError(error);
    }

    const targetLocale = resolveLokaliseTargetLocale(input.targetLocale, languages);
    const keyId = Number(input.externalStringId);
    if (!Number.isFinite(keyId) || keyId <= 0) {
      return "not_found";
    }

    let keys: LokaliseKey[];
    try {
      keys = await fetchLokaliseKeysByIds({
        client,
        projectId: scope.projectId,
        keyIds: [keyId],
      });
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 404) {
        return "not_found";
      }
      mapLokaliseApiError(error);
    }

    const key = keys[0];
    if (!key) {
      return "not_found";
    }

    const translation = pickLokaliseKeyTranslation(key, targetLocale.langIso);
    return mapLokaliseTargetTranslation(translation);
  }

  /** Lists key comments for one CAT segment. */
  async getLiveCatSegmentComments(input: {
    secretMaterial: string;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
  }) {
    const scope = resolveLokaliseLiveCatContext({
      file: input.file,
      externalProjectId: input.externalProjectId,
      secretMaterial: input.secretMaterial,
      baseUrl: input.baseUrl,
    });
    const client = new LokaliseApiClient({
      token: scope.token,
      baseUrl: scope.baseUrl,
    });

    const keyId = Number(input.externalStringId);
    if (!Number.isFinite(keyId) || keyId <= 0) {
      return [];
    }

    try {
      const comments = await client.listKeyComments(scope.projectId, keyId);
      return comments.map((comment) => mapLokaliseKeyComment(comment));
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 404) {
        return [];
      }
      mapLokaliseApiError(error);
    }
  }

  /** Saves an approved target translation for one CAT segment via bulk key update. */
  async saveLiveCatTranslation(input: {
    secretMaterial: string;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
    text: string;
  }) {
    const scope = resolveLokaliseLiveCatContext({
      file: input.file,
      externalProjectId: input.externalProjectId,
      secretMaterial: input.secretMaterial,
      baseUrl: input.baseUrl,
    });
    const client = new LokaliseApiClient({
      token: scope.token,
      baseUrl: scope.baseUrl,
    });

    let languages: LokaliseLanguage[];
    try {
      languages = await client.listProjectLanguages(scope.projectId);
    } catch (error) {
      mapLokaliseApiError(error);
    }

    const targetLocale = resolveLokaliseTargetLocale(input.targetLocale, languages);
    const keyId = Number(input.externalStringId);
    if (!Number.isFinite(keyId) || keyId <= 0) {
      throw new LokaliseLiveCatError(
        "invalid_lokalise_key_id",
        "Lokalise key identifier is invalid.",
      );
    }

    try {
      await client.bulkUpdateKeys(scope.projectId, [
        {
          keyId,
          translations: [
            {
              languageIso: targetLocale.langIso,
              translation: input.text,
              isUnverified: false,
              isReviewed: true,
            },
          ],
        },
      ]);
    } catch (error) {
      mapLokaliseApiError(error);
    }

    const keys = await fetchLokaliseKeysByIds({
      client,
      projectId: scope.projectId,
      keyIds: [keyId],
    });
    const savedTranslation = pickLokaliseKeyTranslation(keys[0], targetLocale.langIso);

    return {
      text: savedTranslation?.translation.trim() || input.text,
      externalTranslationId: savedTranslation
        ? String(savedTranslation.translationId)
        : `${keyId}:${targetLocale.langIso}`,
      isApproved: lokaliseTranslationIsApproved(savedTranslation),
    };
  }

  /** Creates a key comment from the live CAT editor. */
  async saveLiveCatComment(input: {
    secretMaterial: string;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
    text: string;
  }) {
    const scope = resolveLokaliseLiveCatContext({
      file: input.file,
      externalProjectId: input.externalProjectId,
      secretMaterial: input.secretMaterial,
      baseUrl: input.baseUrl,
    });
    const client = new LokaliseApiClient({
      token: scope.token,
      baseUrl: scope.baseUrl,
    });

    const keyId = Number(input.externalStringId);
    if (!Number.isFinite(keyId) || keyId <= 0) {
      throw new LokaliseLiveCatError(
        "invalid_lokalise_key_id",
        "Lokalise key identifier is invalid.",
      );
    }

    let created: Awaited<ReturnType<typeof client.createKeyComments>>;
    try {
      created = await client.createKeyComments(scope.projectId, keyId, [{ comment: input.text }]);
    } catch (error) {
      mapLokaliseApiError(error);
    }

    const comment = created[0];
    if (!comment) {
      throw new LokaliseLiveCatError(
        "lokalise_provider_comment_create_failed",
        "Lokalise did not return the created comment.",
      );
    }

    return mapLokaliseKeyComment(comment);
  }
}

/** Shared Lokalise TMS provider instance registered in the provider registry. */
export const lokaliseTmsProvider = new LokaliseTmsProvider();

const LOKALISE_PROJECT_GLOSSARY_EXTERNAL_ID_SUFFIX = ":glossary";
const LOKALISE_PROJECT_TM_EXTERNAL_ID_SUFFIX = ":translation-memory";

function uniqueLocales(locales: string[]): string[] {
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

function buildLokaliseProjectGlossaryExternalId(projectId: string) {
  return `${projectId.trim()}${LOKALISE_PROJECT_GLOSSARY_EXTERNAL_ID_SUFFIX}`;
}

function buildLokaliseProjectTranslationMemoryExternalId(projectId: string) {
  return `${projectId.trim()}${LOKALISE_PROJECT_TM_EXTERNAL_ID_SUFFIX}`;
}

function scoreLokaliseTextMatch(sourceText: string, candidateText: string) {
  const source = sourceText.trim();
  const candidate = candidateText.trim();
  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 100;
  }

  const sourceLower = source.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  if (sourceLower === candidateLower) {
    return 98;
  }

  if (candidateLower.includes(sourceLower) || sourceLower.includes(candidateLower)) {
    const ratio =
      Math.min(source.length, candidate.length) / Math.max(source.length, candidate.length);
    return Math.round(70 + ratio * 25);
  }

  const sourceTokens = tokenizeLokaliseText(sourceLower);
  const candidateTokens = tokenizeLokaliseText(candidateLower);
  if (sourceTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const overlap = sourceTokens.filter((token) => candidateTokens.includes(token)).length;
  if (overlap === 0) {
    return 0;
  }

  const coverage = overlap / Math.max(sourceTokens.length, candidateTokens.length);
  return Math.round(50 + coverage * 40);
}

function matchesLokaliseGlossaryTerm(
  sourceText: string,
  term: Pick<LokaliseGlossaryTerm, "term" | "caseSensitive">,
) {
  const score = scoreLokaliseTextMatch(sourceText, term.term);
  if (score < 55) {
    return false;
  }

  if (!term.caseSensitive) {
    return true;
  }

  const trimmedTerm = term.term.trim();
  const trimmedSource = sourceText.trim();
  return trimmedSource === trimmedTerm || trimmedSource.includes(trimmedTerm);
}

function pickLokaliseGlossaryTranslation(
  term: LokaliseGlossaryTerm,
  targetLocale: string,
  languageIsoById: Map<number, string>,
) {
  const normalizedTarget = targetLocale.trim().toLowerCase();
  for (const translation of term.translations) {
    const locale = resolveLokaliseGlossaryTranslationLocale(translation, languageIsoById);
    if (!locale || locale.toLowerCase() !== normalizedTarget) {
      continue;
    }

    const targetTerm = translation.translation.trim();
    if (targetTerm) {
      return targetTerm;
    }
  }

  return null;
}

function resolveLokaliseGlossaryTranslationLocale(
  translation: LokaliseGlossaryTerm["translations"][number],
  languageIsoById: Map<number, string>,
) {
  const direct =
    translation.languageIso?.trim() ||
    translation.langIso?.trim() ||
    translation.languageIsoSnake?.trim() ||
    translation.langIsoSnake?.trim();
  if (direct) {
    return direct;
  }

  const languageId = translation.languageId || translation.languageIdSnake;
  if (languageId != null && languageId > 0) {
    return languageIsoById.get(languageId) ?? null;
  }

  return null;
}

function pickLokaliseKeyTranslation(key: LokaliseKey, locale: string): LokaliseTranslation | null {
  const normalizedLocale = locale.trim().toLowerCase();
  return (
    key.translations.find(
      (translation) => translation.languageIso.trim().toLowerCase() === normalizedLocale,
    ) ?? null
  );
}

function buildLokaliseTranslationMemorySegmentCandidates(
  keys: LokaliseKey[],
  input: {
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    limit: number;
  },
) {
  const scored: Array<{
    keyId: number;
    sourceText: string;
    targetText: string;
    matchScore: number;
  }> = [];

  for (const key of keys) {
    const sourceTranslation = pickLokaliseKeyTranslation(key, input.sourceLocale);
    const targetTranslation = pickLokaliseKeyTranslation(key, input.targetLocale);
    if (!sourceTranslation || !targetTranslation) {
      continue;
    }

    const sourceSegment = sourceTranslation.translation.trim();
    const targetSegment = targetTranslation.translation.trim();
    if (!sourceSegment || !targetSegment) {
      continue;
    }

    const matchScore = scoreLokaliseTextMatch(input.sourceText, sourceSegment);
    if (matchScore < 55) {
      continue;
    }

    scored.push({
      keyId: key.keyId,
      sourceText: sourceSegment,
      targetText: targetSegment,
      matchScore,
    });
  }

  return scored.toSorted((left, right) => right.matchScore - left.matchScore).slice(0, input.limit);
}

function tokenizeLokaliseText(value: string) {
  return value
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

type LokaliseLocaleReadinessStatus = "ready" | "missing" | "unverified" | "excluded";

function mapLokaliseTranslationReadiness(input: {
  content?: string | null;
  isUnverified?: boolean;
  isReviewed?: boolean;
  isArchived?: boolean;
  isHidden?: boolean;
}): LokaliseLocaleReadinessStatus {
  if (input.isArchived || input.isHidden) {
    return "excluded";
  }

  const content = input.content?.trim();
  if (!content) {
    return "missing";
  }

  if (input.isUnverified) {
    return "unverified";
  }

  if (input.isReviewed) {
    return "ready";
  }

  return "unverified";
}

function buildLokaliseKeyExternalResourceId(keyId: number) {
  return String(keyId);
}

function buildLokaliseKeySourcePath(keyName: string, filename: string | null) {
  const trimmedName = keyName.trim();
  const trimmedFilename = filename?.trim();
  if (trimmedFilename) {
    return `files/${trimmedFilename}/keys/${trimmedName}`;
  }

  return `keys/${trimmedName}`;
}

function buildLokaliseFileExternalResourceId(platform: string, filename: string) {
  return `${platform.trim()}::${filename.trim()}`;
}

function buildLokaliseFileSourcePath(
  sourceLocale: string | null,
  platform: string,
  filename: string,
) {
  const trimmedFilename = filename.trim();
  const trimmedPlatform = platform.trim();
  const trimmedLocale = sourceLocale?.trim();
  if (trimmedLocale) {
    return `locales/${trimmedLocale}/${trimmedPlatform}/${trimmedFilename}`;
  }

  return `files/${trimmedPlatform}/${trimmedFilename}`;
}

type LokaliseTranslationWriteBackEntry = {
  keyId: number;
  keyName: string | null;
  locale: string;
  text: string;
};

function buildLokaliseTranslationWriteBackBatches(input: {
  translations: ExternalTmsApprovedTranslationUpload[];
  defaultTargetLocale: string | null;
  taskTargetLocales?: string[];
}): {
  batches: LokaliseBulkUpdateKey[];
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
} {
  const entriesByKeyId = new Map<number, LokaliseTranslationWriteBackEntry[]>();
  const translationLocalesByKeyId = new Map<number, Map<string, string>>();
  const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];
  const taskTargetLocales = (input.taskTargetLocales ?? [])
    .map((locale) => locale.trim())
    .filter(Boolean);
  const allowDefaultTargetLocale = taskTargetLocales.length <= 1;

  for (const translation of input.translations) {
    const requestedLocale = translation.locale.trim();
    const locale =
      requestedLocale || (allowDefaultTargetLocale ? input.defaultTargetLocale?.trim() || "" : "");
    const text = translation.text.trim();
    const keyId = parseLokaliseKeyId(translation.externalStringId);
    const keyName = translation.key?.trim() || null;

    if (!locale) {
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message:
          requestedLocale || allowDefaultTargetLocale
            ? "lokalise_translation_missing_locale"
            : "lokalise_translation_ambiguous_locale",
      });
      continue;
    }

    if (keyId == null) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "lokalise_translation_missing_key_id",
      });
      continue;
    }

    if (!text) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "lokalise_translation_missing_text",
      });
      continue;
    }

    const localesForKey = translationLocalesByKeyId.get(keyId) ?? new Map<string, string>();
    const previousText = localesForKey.get(locale);
    if (previousText !== undefined && previousText !== text) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "lokalise_translation_duplicate_locale",
      });
      continue;
    }
    localesForKey.set(locale, text);
    translationLocalesByKeyId.set(keyId, localesForKey);

    const existing = entriesByKeyId.get(keyId) ?? [];
    if (!previousText) {
      existing.push({ keyId, keyName, locale, text });
      entriesByKeyId.set(keyId, existing);
    }
  }

  const batches: LokaliseBulkUpdateKey[] = [];
  for (const entries of entriesByKeyId.values()) {
    batches.push({
      keyId: entries[0]!.keyId,
      translations: entries.map((entry) => ({
        languageIso: entry.locale,
        translation: entry.text,
        isUnverified: false,
        isReviewed: true,
      })),
    });
  }

  return { batches, failures };
}

function parseLokaliseKeyId(externalStringId: string | null | undefined) {
  const trimmed = externalStringId?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const keyId = Number(trimmed);
  if (!Number.isInteger(keyId) || keyId <= 0) {
    return null;
  }

  return keyId;
}

type LokaliseCommentWriteBackEntry = {
  findingId: string;
  finding: ProviderQaFinding;
  request: {
    keyId: number;
    locale: string | null;
    comment: string;
  };
};

function formatCommentText(finding: ProviderQaFinding, findingId: string) {
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

function buildLokaliseCommentWriteBackEntries(input: {
  findings: ProviderQaFinding[];
  defaultLocaleId: string | null;
}): {
  entries: LokaliseCommentWriteBackEntry[];
  failures: Array<{ findingId: string; message: string }>;
} {
  const entries: LokaliseCommentWriteBackEntry[] = [];
  const failures: Array<{ findingId: string; message: string }> = [];

  for (const finding of input.findings) {
    const findingId = buildFindingId(finding);
    const keyId = parseLokaliseKeyId(finding.item.externalStringId);
    const locale = finding.item.locale?.trim() || input.defaultLocaleId?.trim() || null;

    if (keyId == null) {
      failures.push({
        findingId,
        message: "lokalise_comment_missing_key_id",
      });
      continue;
    }

    entries.push({
      findingId,
      finding,
      request: {
        keyId,
        locale,
        comment: formatCommentText(finding, findingId),
      },
    });
  }

  return { entries, failures };
}

function mapLokaliseCommentAuthor(comment: LokaliseComment): ProviderReviewAuthor | null {
  if (comment.addedBy == null && !comment.addedByEmail) {
    return null;
  }

  return {
    externalUserId: comment.addedBy != null ? String(comment.addedBy) : null,
    displayName: comment.addedByEmail,
    username: comment.addedByEmail,
  };
}

function normalizeLokaliseKeyCommentToThread(input: {
  comment: LokaliseComment;
  externalProjectId: string;
  externalJobId: string;
  stringKeyById: Map<string, string>;
}): ProviderReviewThread {
  const externalThreadId = String(input.comment.commentId);
  const stringKey =
    input.stringKeyById.get(String(input.comment.keyId)) ?? String(input.comment.keyId);

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "lokalise",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "comment",
      externalThreadId,
    }),
    kind: "comment",
    state: "unknown",
    subject: input.comment.comment,
    item: {
      externalStringId: String(input.comment.keyId),
      key: stringKey,
      field: "target",
    },
    comments: [
      {
        externalCommentId: externalThreadId,
        body: input.comment.comment,
        author: mapLokaliseCommentAuthor(input.comment),
        createdAt: input.comment.addedAt,
        updatedAt: input.comment.addedAt,
      },
    ],
    author: mapLokaliseCommentAuthor(input.comment),
    createdAt: input.comment.addedAt,
    updatedAt: input.comment.addedAt,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: externalThreadId,
      providerUrl: buildLokaliseKeyCommentProviderUrl({
        projectId: input.externalProjectId,
        taskId: input.externalJobId,
        keyId: input.comment.keyId,
        commentId: input.comment.commentId,
      }),
    },
  };
}

type DiscoveredFile = {
  platform: string;
  filename: string;
  format: string | null;
  tags: Set<string>;
  keyIds: Set<number>;
  revision: string | null;
};

type LocaleProgressCounts = {
  total: number;
  translated: number;
  approved: number;
};

function readProjectMetadata(project: { providerMetadata: Record<string, unknown> }) {
  return project.providerMetadata;
}

function pickLatestRevision(current: string | null, candidate: string | null) {
  if (!current) {
    return candidate;
  }

  if (!candidate) {
    return current;
  }

  return candidate > current ? candidate : current;
}

function buildKeyLocaleReadiness(input: { key: LokaliseKey; targetLocales: string[] }) {
  const localeReadiness: Record<string, string> = {};
  const translationsByLocale = new Map(
    input.key.translations.map((translation) => [translation.languageIso, translation]),
  );

  for (const locale of input.targetLocales) {
    const translation = translationsByLocale.get(locale);
    localeReadiness[locale] = mapLokaliseTranslationReadiness({
      content: translation?.translation,
      isUnverified: translation?.isUnverified,
      isReviewed: translation?.isReviewed,
      isArchived: input.key.isArchived,
      isHidden: input.key.isHidden,
    });
  }

  return localeReadiness;
}

function buildFileLocaleReadiness(input: { keys: LokaliseKey[]; targetLocales: string[] }) {
  const localeReadiness: Record<string, string> = {};
  const keysWithTranslations = input.keys.map((key) => ({
    key,
    translationsByLocale: new Map(
      key.translations.map((translation) => [translation.languageIso, translation]),
    ),
  }));

  for (const locale of input.targetLocales) {
    const statuses = keysWithTranslations.map(({ key, translationsByLocale }) => {
      const translation = translationsByLocale.get(locale);
      return mapLokaliseTranslationReadiness({
        content: translation?.translation,
        isUnverified: translation?.isUnverified,
        isReviewed: translation?.isReviewed,
        isArchived: key.isArchived,
        isHidden: key.isHidden,
      });
    });

    if (statuses.length === 0) {
      localeReadiness[locale] = "missing";
      continue;
    }

    const activeStatuses = statuses.filter((status) => status !== "excluded");
    if (activeStatuses.length === 0) {
      localeReadiness[locale] = "excluded";
      continue;
    }

    if (activeStatuses.every((status) => status === "ready")) {
      localeReadiness[locale] = "ready";
      continue;
    }

    if (activeStatuses.some((status) => status === "missing")) {
      localeReadiness[locale] = "missing";
      continue;
    }

    localeReadiness[locale] = "unverified";
  }

  return localeReadiness;
}

function isCountableKey(key: LokaliseKey) {
  return !key.isArchived && !key.isHidden;
}

function countTranslationState(keys: LokaliseKey[], locale: string): LocaleProgressCounts {
  let total = 0;
  let translated = 0;
  let approved = 0;

  for (const key of keys) {
    if (!isCountableKey(key)) {
      continue;
    }

    total += 1;
    const translation = pickLokaliseKeyTranslation(key, locale);
    const readiness = mapLokaliseTranslationReadiness({
      content: translation?.translation,
      isUnverified: translation?.isUnverified,
      isReviewed: translation?.isReviewed,
      isArchived: key.isArchived,
      isHidden: key.isHidden,
    });

    if (readiness === "missing" || readiness === "excluded") {
      continue;
    }

    translated += 1;
    if (readiness === "ready") {
      approved += 1;
    }
  }

  return { total, translated, approved };
}

function toProgressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((completed / total) * 100);
}

async function listKeysByIds(client: LokaliseApiClient, projectId: string, keyIds: number[]) {
  const keysById = new Map<number, LokaliseKey>();
  for (let index = 0; index < keyIds.length; index += KEY_ID_CHUNK_SIZE) {
    const chunk = keyIds.slice(index, index + KEY_ID_CHUNK_SIZE);
    const page = await client.listKeys(projectId, {
      includeTranslations: true,
      filterKeyIds: chunk,
    });
    for (const key of page) {
      keysById.set(key.keyId, key);
    }
  }

  return [...keysById.values()];
}

function pickPrimaryFilename(key: LokaliseKey) {
  for (const platform of key.platforms) {
    const normalizedPlatform = platform.trim().toLowerCase();
    if (normalizedPlatform === "web" && key.filenames.web.trim()) {
      return key.filenames.web;
    }
    if (normalizedPlatform === "ios" && key.filenames.ios.trim()) {
      return key.filenames.ios;
    }
    if (normalizedPlatform === "android" && key.filenames.android.trim()) {
      return key.filenames.android;
    }
    if (normalizedPlatform === "other" && key.filenames.other.trim()) {
      return key.filenames.other;
    }
  }

  return listLokaliseFilenameEntries(key.filenames)[0]?.filename ?? null;
}

function buildNonEmptyFilenamesPayload(filenames: LokaliseKey["filenames"]) {
  return Object.fromEntries(
    listLokaliseFilenameEntries(filenames).map((entry) => [entry.platform, entry.filename]),
  );
}

function inferPrimaryFormat(keys: LokaliseKey[]) {
  for (const key of keys) {
    const filename = pickPrimaryFilename(key);
    if (!filename) {
      continue;
    }

    const format = inferFormatFromFilename(filename);
    if (format) {
      return format;
    }
  }

  return null;
}

type LokaliseLiveCatContext = {
  token: string;
  baseUrl?: string | null;
  projectId: string;
};

type LokaliseQueueSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
};

function mapLokaliseApiError(error: unknown): never {
  if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
    throw new LokaliseLiveCatError(
      "lokalise_auth_invalid",
      "Lokalise credentials are invalid or lack permission for this project.",
    );
  }
  throw error;
}

function readFileMetadata(file: TmsProviderLiveFile) {
  const payload = file.metadata ?? {};
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
  const keyIds = Array.isArray(payload.keyIds)
    ? payload.keyIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  return { tags, keyIds };
}

function resolveLokaliseLiveCatContext(input: {
  file: TmsProviderLiveFile;
  externalProjectId: string;
  secretMaterial: string;
  baseUrl?: string | null;
}): LokaliseLiveCatContext {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    throw new LokaliseLiveCatError(
      "invalid_lokalise_project_id",
      "Lokalise project identifier is invalid.",
    );
  }

  return {
    token: input.secretMaterial,
    baseUrl: input.baseUrl,
    projectId,
  };
}

function buildQueueSegmentFromKey(
  key: LokaliseKey,
  sourceLocale: string | null,
): LokaliseQueueSegmentDraft {
  const keyName = extractLokaliseKeyName(key.keyName);
  const sourceTranslation = sourceLocale ? pickLokaliseKeyTranslation(key, sourceLocale) : null;
  const sourceText = sourceTranslation?.translation.trim() || keyName;

  return {
    externalStringId: String(key.keyId),
    key: keyName,
    sourceText,
    context: key.context ?? key.description,
    type: key.isPlural ? "plural" : null,
  };
}

function draftToQueueSegment(draft: LokaliseQueueSegmentDraft): ProjectFileCatQueueSegment {
  return {
    externalStringId: draft.externalStringId,
    key: draft.key,
    sourceText: draft.sourceText,
    context: draft.context,
    type: draft.type,
  };
}

function segmentMatchesSearch(segment: LokaliseQueueSegmentDraft, search: string | undefined) {
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

function filterKeysByFileTags(keys: LokaliseKey[], tags: string[]) {
  if (tags.length === 0) {
    return keys;
  }

  return keys.filter((key) => key.tags.some((tag) => tags.includes(tag)));
}

function lokaliseTranslationIsApproved(translation: LokaliseTranslation | null | undefined) {
  if (!translation) {
    return false;
  }

  return (
    mapLokaliseTranslationReadiness({
      content: translation.translation,
      isUnverified: translation.isUnverified,
      isReviewed: translation.isReviewed,
    }) === "ready"
  );
}

function mapLokaliseTargetTranslation(
  translation: LokaliseTranslation | null | undefined,
): ProjectFileCatTranslation | null {
  if (!translation?.translation?.trim()) {
    return null;
  }

  return {
    text: translation.translation,
    externalTranslationId: String(translation.translationId),
    isApproved: lokaliseTranslationIsApproved(translation),
  };
}

function resolveLokaliseTargetLocale(
  targetLocale: string,
  languages: LokaliseLanguage[],
): LokaliseLanguage {
  const normalized = targetLocale.trim().toLowerCase();
  const matched =
    languages.find((language) => language.langIso.trim().toLowerCase() === normalized) ?? null;
  if (!matched) {
    throw new LokaliseLiveCatError(
      "lokalise_target_locale_not_found",
      `Target locale "${targetLocale}" was not found in the Lokalise project.`,
    );
  }

  return matched;
}

function mapLokaliseKeyComment(comment: {
  commentId: number;
  comment: string;
  addedAt: string | null;
  addedByEmail: string | null;
}): ProjectFileCatComment {
  return {
    externalCommentId: String(comment.commentId),
    type: "comment",
    status: null,
    text: comment.comment,
    createdAt: comment.addedAt,
    locale: null,
    author: comment.addedByEmail,
  };
}

async function fetchLokaliseKeysByIds(input: {
  client: LokaliseApiClient;
  projectId: string;
  keyIds: number[];
}): Promise<LokaliseKey[]> {
  if (input.keyIds.length === 0) {
    return [];
  }

  const keys: LokaliseKey[] = [];
  for (let index = 0; index < input.keyIds.length; index += LOKALISE_KEY_FETCH_CHUNK_SIZE) {
    const chunk = input.keyIds.slice(index, index + LOKALISE_KEY_FETCH_CHUNK_SIZE);
    try {
      const pageKeys = await input.client.listKeys(input.projectId, {
        includeTranslations: true,
        filterKeyIds: chunk,
      });
      keys.push(...pageKeys);
    } catch (error) {
      mapLokaliseApiError(error);
    }
  }

  return keys;
}

async function advanceLokaliseKeysCursor(input: {
  client: LokaliseApiClient;
  projectId: string;
  targetScanPage: number;
  pageSize: number;
}): Promise<{ cursor: string; scanComplete: boolean }> {
  let cursor = "";
  for (let page = 1; page < input.targetScanPage; page++) {
    let result: Awaited<ReturnType<LokaliseApiClient["listKeysCursorPage"]>>;
    try {
      result = await input.client.listKeysCursorPage(input.projectId, {
        includeTranslations: false,
        cursor: cursor || undefined,
        limit: input.pageSize,
      });
    } catch (error) {
      mapLokaliseApiError(error);
    }
    if (!result.nextCursor) {
      return { cursor: "", scanComplete: true };
    }
    cursor = result.nextCursor;
  }

  return { cursor, scanComplete: false };
}

async function loadLokaliseQueuePage(input: {
  client: LokaliseApiClient;
  scope: LokaliseLiveCatContext;
  file: TmsProviderLiveFile;
  paginationInput: ProjectFileCatPaginationInput;
}): Promise<{
  segments: ProjectFileCatQueueSegment[];
  hasMore: boolean;
  nextPhraseScanPage?: number;
  nextPhraseScanSkip?: number;
}> {
  const metadata = readFileMetadata(input.file);
  const resourceType = input.file.provider?.resourceType;
  const sourceLocale = input.file.provider?.sourceLocale ?? null;
  const { offset, limit, search, queueFilter } = input.paginationInput;

  if (queueFilter === "has_issues") {
    throw new LokaliseLiveCatError(
      "lokalise_cat_queue_filter_unsupported",
      "Lokalise does not support filtering the CAT queue by issues.",
    );
  }

  if (resourceType === "key") {
    const keyId = Number(input.file.provider?.externalResourceId);
    if (!Number.isFinite(keyId) || keyId <= 0) {
      return { segments: [], hasMore: false };
    }

    let keys: LokaliseKey[];
    try {
      keys = await fetchLokaliseKeysByIds({
        client: input.client,
        projectId: input.scope.projectId,
        keyIds: [keyId],
      });
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 404) {
        return { segments: [], hasMore: false };
      }
      mapLokaliseApiError(error);
    }

    const segments = keys
      .map((key) => buildQueueSegmentFromKey(key, sourceLocale))
      .filter((segment) => segmentMatchesSearch(segment, search))
      .slice(offset, offset + limit)
      .map(draftToQueueSegment);

    return {
      segments,
      hasMore: false,
    };
  }

  const scopedKeyIds = metadata.keyIds;
  const needsClientSideFilter = Boolean(search?.trim()) || metadata.tags.length > 0;

  if (!needsClientSideFilter && scopedKeyIds.length > 0) {
    const pageKeyIds = scopedKeyIds.slice(offset, offset + limit);
    const keys = await fetchLokaliseKeysByIds({
      client: input.client,
      projectId: input.scope.projectId,
      keyIds: pageKeyIds,
    });
    const keysById = new Map(keys.map((key) => [key.keyId, key]));
    const segments = pageKeyIds
      .map((keyId) => keysById.get(keyId))
      .filter((key): key is LokaliseKey => key != null)
      .map((key) => buildQueueSegmentFromKey(key, sourceLocale))
      .map(draftToQueueSegment);

    return {
      segments,
      hasMore: offset + limit < scopedKeyIds.length,
    };
  }

  if (!needsClientSideFilter && scopedKeyIds.length === 0) {
    const collected: LokaliseKey[] = [];
    let cursor = "";
    let skipped = 0;
    let hasMore = false;

    while (collected.length < limit) {
      let page: Awaited<ReturnType<LokaliseApiClient["listKeysCursorPage"]>>;
      try {
        page = await input.client.listKeysCursorPage(input.scope.projectId, {
          includeTranslations: false,
          cursor: cursor || undefined,
          limit: LOKALISE_QUEUE_SCAN_PAGE_SIZE,
        });
      } catch (error) {
        mapLokaliseApiError(error);
      }

      let stoppedEarly = false;
      for (const key of page.keys) {
        if (skipped < offset) {
          skipped += 1;
          continue;
        }

        collected.push(key);
        if (collected.length >= limit) {
          stoppedEarly = true;
          break;
        }
      }

      if (collected.length >= limit) {
        hasMore = Boolean(page.nextCursor) || stoppedEarly;
        break;
      }

      if (!page.nextCursor) {
        break;
      }

      cursor = page.nextCursor;
    }

    return {
      segments: collected
        .map((key) => buildQueueSegmentFromKey(key, sourceLocale))
        .map(draftToQueueSegment),
      hasMore,
    };
  }

  const collected: ProjectFileCatQueueSegment[] = [];
  const resumingScan = input.paginationInput.phraseScanPage != null;
  let scanPage = resumingScan ? input.paginationInput.phraseScanPage! : 1;
  let skipMatches = resumingScan ? (input.paginationInput.phraseScanSkip ?? 0) : offset;
  let scanComplete = false;
  let nextPhraseScanPage: number | undefined;
  let nextPhraseScanSkip: number | undefined;
  let listKeysCursor = "";
  if (resumingScan && scopedKeyIds.length === 0) {
    const advanced = await advanceLokaliseKeysCursor({
      client: input.client,
      projectId: input.scope.projectId,
      targetScanPage: scanPage,
      pageSize: LOKALISE_QUEUE_SCAN_PAGE_SIZE,
    });
    if (advanced.scanComplete) {
      scanComplete = true;
    } else {
      listKeysCursor = advanced.cursor;
    }
  }
  const scanPageBudget = resumingScan
    ? scanPage + LOKALISE_MAX_SCAN_PAGES - 1
    : Math.max(
        LOKALISE_MAX_SCAN_PAGES,
        Math.ceil((offset + limit) / LOKALISE_QUEUE_SCAN_PAGE_SIZE) + LOKALISE_MAX_SCAN_PAGES,
      );

  while (!scanComplete && collected.length < limit && scanPage <= scanPageBudget) {
    const chunkStart = (scanPage - 1) * LOKALISE_QUEUE_SCAN_PAGE_SIZE;
    const chunkKeyIds =
      scopedKeyIds.length > 0
        ? scopedKeyIds.slice(chunkStart, chunkStart + LOKALISE_QUEUE_SCAN_PAGE_SIZE)
        : null;

    let keys: LokaliseKey[];
    if (chunkKeyIds != null) {
      if (chunkKeyIds.length === 0) {
        scanComplete = true;
        break;
      }
      keys = await fetchLokaliseKeysByIds({
        client: input.client,
        projectId: input.scope.projectId,
        keyIds: chunkKeyIds,
      });
    } else {
      try {
        const page = await input.client.listKeysCursorPage(input.scope.projectId, {
          includeTranslations: false,
          cursor: listKeysCursor || undefined,
          limit: LOKALISE_QUEUE_SCAN_PAGE_SIZE,
        });
        keys = page.keys;
        listKeysCursor = page.nextCursor ?? "";
        if (!page.nextCursor) {
          scanComplete = true;
        }
      } catch (error) {
        mapLokaliseApiError(error);
      }
    }

    const filteredKeys = filterKeysByFileTags(keys, metadata.tags);
    const drafts = filteredKeys.map((key) => buildQueueSegmentFromKey(key, sourceLocale));

    let matchesSeenOnPage = 0;
    for (const draft of drafts) {
      if (!segmentMatchesSearch(draft, search)) {
        continue;
      }

      matchesSeenOnPage += 1;
      if (skipMatches > 0) {
        skipMatches -= 1;
        continue;
      }

      collected.push(draftToQueueSegment(draft));
      if (collected.length >= limit) {
        nextPhraseScanPage = scanPage;
        nextPhraseScanSkip = matchesSeenOnPage;
        break;
      }
    }

    if (collected.length >= limit) {
      break;
    }

    if (chunkKeyIds != null) {
      if (chunkStart + LOKALISE_QUEUE_SCAN_PAGE_SIZE >= scopedKeyIds.length) {
        scanComplete = true;
        break;
      }
    } else if (scanComplete) {
      break;
    }

    scanPage += 1;
    skipMatches = 0;
  }

  return {
    segments: collected,
    hasMore: collected.length >= limit && !scanComplete,
    nextPhraseScanPage,
    nextPhraseScanSkip,
  };
}

async function listOpenAndRecentLokaliseTasks(client: LokaliseApiClient, projectId: string) {
  const completedAfterMs = Date.now() - LOKALISE_RECENT_COMPLETED_WINDOW_MS;
  const [openTasks, recentCompletedTasks] = await Promise.all([
    client.listTasks(projectId, { filterStatuses: [...LOKALISE_OPEN_TASK_STATUSES] }),
    client.listTasks(projectId, {
      filterStatuses: ["completed"],
      maxPages: LOKALISE_COMPLETED_TASK_MAX_PAGES,
      completedAfterMs,
    }),
  ]);
  const tasksById = new Map<number, LokaliseTask>();
  for (const task of [...openTasks, ...recentCompletedTasks]) {
    tasksById.set(task.taskId, task);
  }
  return [...tasksById.values()];
}

function mapLokaliseTaskKind(
  taskType: string,
): "translation" | "research" | "review" | "sync" | "asset_management" {
  switch (taskType) {
    case "review":
    case "lqa_by_ai":
      return "review";
    case "automatic_translation":
      return "sync";
    case "translation":
    default:
      return "translation";
  }
}

function mapLokaliseFetcherError(error: unknown) {
  if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
    return new Error("lokalise_auth_invalid");
  }
  return error instanceof Error ? error : new Error("lokalise_fetch_failed");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function rethrowLokaliseAuthError(error: unknown): never {
  if (error instanceof LokaliseApiError && error.status === 401) {
    throw new Error("lokalise_auth_invalid");
  }
  throw error;
}

function rethrowLokaliseConcordanceApiError(error: unknown): never {
  if (error instanceof LokaliseApiError) {
    if (error.status === 401 || error.status === 403) {
      throw new TmsProviderLiveError(
        "lokalise_auth_invalid",
        "Lokalise credentials are invalid or lack permission for this project.",
      );
    }
    if (error.status === 404) {
      throw new TmsProviderLiveError(
        "invalid_lokalise_project_id",
        "The Lokalise project could not be found.",
      );
    }
    throw new TmsProviderLiveError(
      "provider_fetch_failed",
      "Failed to fetch glossary and translation memory from Lokalise.",
    );
  }
  if (error instanceof Error && error.message === "lokalise_auth_invalid") {
    throw new TmsProviderLiveError("lokalise_auth_invalid", "Lokalise credentials are invalid.");
  }
  throw error;
}

function mapLokaliseScreenshot(
  screenshot: Awaited<ReturnType<LokaliseApiClient["listScreenshotsForKey"]>>[number],
  keyId: number,
): CatVisualContextScreenshot {
  const markers = screenshot.keyAreas
    .filter((area) => area.keyId === keyId)
    .map((area) =>
      pixelRectToPercentMarkers({
        width: screenshot.width,
        height: screenshot.height,
        left: area.left,
        top: area.top,
        widthPx: area.width,
        heightPx: area.height,
      }),
    )
    .filter((marker): marker is NonNullable<typeof marker> => marker != null);

  return {
    id: String(screenshot.screenshotId),
    name: screenshot.title,
    imageUrl: screenshot.imageUrl,
    width: screenshot.width,
    height: screenshot.height,
    markers,
  };
}
