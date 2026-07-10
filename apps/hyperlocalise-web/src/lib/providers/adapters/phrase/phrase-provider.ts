import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  providerFileFormat,
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import type { ExternalTmsTranslationMemoryMatcherInput } from "@/lib/providers/contracts/translation-memory-matcher";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import {
  TmsProvider,
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
  ExternalTmsFileKeyMetadata,
  ExternalTmsSourceFileUpload,
  ExternalTmsTaskContent,
} from "@/lib/providers/jobs/tms-provider-types";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";
import {
  type CatVisualContext,
  type CatVisualContextMarker,
  type CatVisualContextScreenshot,
} from "@/lib/translation/cat-visual-context";

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
import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";
import type { ExternalTmsApprovedTranslationUpload } from "@/lib/providers/jobs/tms-provider-types";
import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import type {
  ProviderReviewAuthor,
  ProviderReviewComment,
  ProviderReviewThread,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";
import type { StringTranslationContextSnapshot } from "@/lib/translation/domain";

import {
  createPhraseStringsApiClient,
  PhraseApiClient,
  PhraseApiError,
  type PhraseKey,
  type PhraseKeyComment,
  type PhraseKeyScreenshot,
  type PhraseLocale,
  type PhraseTranslation,
  type PhraseUserPreview,
} from "./phrase-api";
import {
  mapPhraseTmsFetcherError,
  PhraseTmsApiClient,
  PhraseTmsApiError,
  type PhraseTmsConversation,
  type PhraseTmsConversationUser,
  type PhraseTmsJobPart,
  type PhraseTmsResourceReference,
  type PhraseTmsSearchSegmentResult,
} from "./phrase-tms-api";

export {
  PHRASE_OAUTH_SCOPE_GUIDE,
  PHRASE_OAUTH_SCOPES,
  getPhraseOAuthScopeString,
  type PhraseOAuthScopeGuideEntry,
} from "@/lib/providers/adapters/phrase/phrase-oauth-scopes";

/**
 * Phrase TMS provider adapter.
 *
 * Bridges Hyperlocalise to two Phrase APIs:
 * - **Phrase Strings** (`PhraseApiClient`) for projects, keys, uploads, translations, comments,
 *   screenshots, and live CAT.
 * - **Phrase TMS** (`PhraseTmsApiClient`) for job parts, term bases, translation memories, LQA
 *   conversations, and TM segment search.
 *
 * Hyperlocalise external job ids encode `{innerId}-task-{localeSuffix}` so Strings and TMS job
 * parts can be correlated. Job-scoped content is filtered via `hyperlocalise:job:{innerId}` tags
 * on keys when TMS metadata is available.
 *
 * Glossary import exposes TMS term bases for live search; TM import stores metadata only.
 * Automated comment push to Phrase is intentionally partial/not wired.
 */

const implemented = { state: "implemented" } as const satisfies TmsProviderFeature;
const unsupported = { state: "unsupported" } as const satisfies TmsProviderFeature;

const LOCALE_FETCH_CONCURRENCY = 15;
const FILE_LOCALE_FETCH_CONCURRENCY = 8;
const CONTENT_LOCALE_FETCH_CONCURRENCY = 8;
const MAX_PHRASE_SCREENSHOTS_TO_SCAN = 50;
const MAX_PHRASE_SCREENSHOTS_PER_SEGMENT = 8;
const PHRASE_MARKER_FETCH_CONCURRENCY = 5;
const PHRASE_REVIEW_KEY_COMMENT_CHUNK_SIZE = 10;
const PHRASE_LIVE_CAT_LOCALE_FETCH_CONCURRENCY = 8;
const PHRASE_QUEUE_SCAN_PAGE_SIZE = 100;
const PHRASE_MAX_SCAN_PAGES = 50;

const PHRASE_TMS_PROOFREAD_STEP_TOKENS = new Set(["proofread", "proofreading"]);

const PHRASE_TMS_REVIEW_STEP_TOKENS = new Set(["review", "editing", "revision", "lqa"]);

type JobResourceBundle = {
  translationMemories: PhraseTmsResourceReference[];
  termBases: PhraseTmsResourceReference[];
};

type KeysByName = Map<string, { id: string; tags: string[] }>;

/**
 * Phrase implementation of the shared TMS provider contract.
 *
 * Use the exported singleton {@link phraseTmsProvider} in production code.
 */
export class PhraseTmsProvider extends TmsProvider {
  readonly kind = "phrase" as const;
  readonly label = "Phrase";

  readonly auth = {
    workspaceCredential: true,
    userConnection: true,
    note: "Workspace credentials hold the integration; user-facing actions can use Phrase user connections.",
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
    "locales.write": unsupported,
    "files.upload": implemented,
    "files.download": implemented,
    "keys.read": implemented,
    "keys.write": implemented,
    "jobs.create": implemented,
    "jobs.read": implemented,
    "tasks.create": implemented,
    "tasks.read": implemented,
    "comments.read": implemented,
    "comments.write": {
      state: "partial",
      note: "The action is visible, but automated provider comment push is not wired for Phrase.",
      disabledReason:
        "This provider connector does not support writing comments back to the TMS yet.",
    },
    "status_transitions.read": implemented,
    "status_transitions.write": implemented,
    "translation_memory.import": implemented,
    "translation_memory.export": implemented,
    "translation_memory.search": implemented,
    "glossary.import": implemented,
    "glossary.export": implemented,
    "glossary.search": unsupported,
    "qa.run": {
      state: "unsupported",
      disabledReason: "Phrase QA is not wired into this connector yet.",
    },
    "review.pull": implemented,
    "webhooks.receive": implemented,
    "webhooks.configure": implemented,
    "write_back.source": unsupported,
    "write_back.translation": implemented,
    "cat.open": implemented,
    "cat.visual_context": implemented,
    "auth.user_scoped": implemented,
  } satisfies Record<TmsProviderFeatureId, TmsProviderFeature>;

  /** Builds a Phrase Strings API client from workspace credential region/base URL. */
  private createStringsClient(input: {
    credential: { baseUrl?: string | null; region?: string | null };
    secretMaterial: string;
    fetchFn?: typeof fetch;
  }) {
    const client = createPhraseStringsApiClient({
      token: input.secretMaterial,
      region: input.credential.region,
      baseUrl: input.credential.baseUrl,
    });

    if (input.fetchFn) {
      return new PhraseApiClient({
        token: input.secretMaterial,
        region: input.credential.region,
        baseUrl: client.resolvedBaseUrl,
        fetchFn: input.fetchFn,
      });
    }

    return client;
  }

  /** Builds a Phrase TMS API client from workspace credential base URL. */
  private createTmsClient(input: {
    credential: { baseUrl?: string | null };
    secretMaterial: string;
    fetchFn?: typeof fetch;
  }) {
    return new PhraseTmsApiClient({
      token: input.secretMaterial,
      baseUrl: input.credential.baseUrl,
      fetchFn: input.fetchFn,
    });
  }

  /** Lists Phrase Strings projects with locale metadata when available. */
  async fetchProjects(context: TmsProviderContext) {
    const client = this.createStringsClient(context);

    let projects;
    try {
      projects = await client.listProjects();
    } catch (error) {
      this.rethrowStringsAuthError(error);
      throw error;
    }

    return mapWithConcurrency(projects, LOCALE_FETCH_CONCURRENCY, async (project) => {
      try {
        const locales = await client.listLocales(project.id);
        const { sourceLocale, targetLocales } = this.partitionProjectLocales(locales);

        return {
          externalProjectId: project.id,
          name: project.name,
          sourceLocale,
          targetLocales,
          externalProjectUrl: this.buildPhraseProjectUrlFromProject(project),
          isActive: true,
          metadata: {
            slug: project.slug,
            mainFormat: project.mainFormat,
            accountId: project.account?.id ?? null,
            accountSlug: project.account?.slug ?? null,
            locales: locales.map((locale) => ({
              id: locale.id,
              name: locale.name,
              code: locale.code,
              default: locale.default,
            })),
          },
        };
      } catch (error) {
        if (error instanceof PhraseApiError && error.status === 401) {
          throw new Error("phrase_auth_invalid");
        }

        return {
          externalProjectId: project.id,
          name: project.name,
          sourceLocale: null,
          targetLocales: [],
          externalProjectUrl: this.buildPhraseProjectUrlFromProject(project),
          isActive: true,
          metadata: {
            slug: project.slug,
            mainFormat: project.mainFormat,
            accountId: project.account?.id ?? null,
            accountSlug: project.account?.slug ?? null,
            syncWarning: error instanceof Error ? error.message : "locale_fetch_failed",
          },
        };
      }
    });
  }

  /**
   * Discovers upload (file) and key resources across branch scopes.
   *
   * Locale readiness is computed from per-locale translation lists. Upload resources inherit
   * tags from their source upload and scope keys by tag overlap.
   */
  async fetchFileKeys(scope: TmsProviderProjectScope): Promise<ExternalTmsFileKeyMetadata[]> {
    const client = this.createStringsClient(scope);

    if (!scope.externalProjectId.trim()) {
      throw new Error("invalid_phrase_project_id");
    }

    let locales: PhraseLocale[];
    let branches: string[];
    try {
      [locales, branches] = await Promise.all([
        client.listLocales(scope.externalProjectId),
        client
          .listBranches(scope.externalProjectId)
          .then((items) => items.map((branch) => branch.name)),
      ]);
    } catch (error) {
      throw this.mapPhraseFetcherError(error);
    }

    const { sourceLocale, targetLocales, targetLocaleRefs, sourceLocaleRef } =
      this.partitionFileLocales(locales);
    const trimmedBranchFilter = scope.branch?.trim() ?? "";
    const branchScopes = trimmedBranchFilter
      ? [trimmedBranchFilter]
      : this.buildBranchScopes(branches);
    const projectMetadata = scope.project.providerMetadata;
    const mainFormat =
      typeof projectMetadata.mainFormat === "string" ? projectMetadata.mainFormat : null;
    const accountSlug =
      typeof projectMetadata.accountSlug === "string" ? projectMetadata.accountSlug : null;
    const projectSlug = typeof projectMetadata.slug === "string" ? projectMetadata.slug : null;

    const results: ExternalTmsFileKeyMetadata[] = [];

    for (const branch of branchScopes) {
      const listOptions = branch ? { branch } : {};

      let keys: PhraseKey[];
      let uploads: Awaited<ReturnType<typeof client.listUploads>>;
      try {
        [keys, uploads] = await Promise.all([
          client.listKeys(scope.externalProjectId, listOptions),
          client.listUploads(scope.externalProjectId, listOptions),
        ]);
      } catch (error) {
        throw this.mapPhraseFetcherError(error);
      }

      const translationsByKeyId = await this.loadFileTranslationsByKeyId({
        client,
        projectId: scope.externalProjectId,
        locales,
        branch,
      });

      for (const upload of uploads) {
        const sourcePath = buildPhraseUploadSourcePath(sourceLocale, upload.filename, branch);
        const uploadTags = this.mergeTags(upload.tags, upload.tag);
        const localeReadiness = this.buildUploadLocaleReadiness({
          keys,
          uploadsTags: uploadTags,
          targetLocaleRefs,
          translationsByKeyId,
        });

        results.push({
          externalResourceId: this.buildUploadExternalResourceId(upload.id, branch),
          resourceType: "file",
          sourcePath,
          displayName: upload.filename,
          format: upload.format ?? mainFormat,
          sourceLocale,
          targetLocales,
          revision: upload.updatedAt ?? upload.createdAt ?? null,
          externalUrl: upload.url ?? this.buildPhraseProjectUrl(accountSlug, projectSlug),
          syncState: upload.state === "success" ? "synced" : "pending",
          localeReadiness,
          providerPayload: {
            id: upload.id,
            name: upload.filename,
            branch,
            tags: uploadTags,
            tag: upload.tag,
            state: upload.state,
            format: upload.format,
            url: upload.url,
            localeDownload: sourceLocaleRef
              ? client.buildLocaleDownloadMetadata({
                  projectId: scope.externalProjectId,
                  locale: sourceLocaleRef,
                  fileFormat: upload.format ?? mainFormat,
                  branch,
                  tags: uploadTags,
                })
              : null,
          },
        });
      }

      for (const key of keys) {
        const localeReadiness = this.buildKeyLocaleReadiness({
          keyId: key.id,
          targetLocaleRefs,
          translationsByKeyId,
        });

        results.push({
          externalResourceId: buildPhraseKeyExternalResourceId(key.id, branch),
          resourceType: "key",
          sourcePath: buildPhraseKeySourcePath(key.name, branch),
          displayName: key.name,
          format: key.dataType ?? mainFormat,
          sourceLocale,
          targetLocales,
          revision: key.updatedAt ?? key.createdAt ?? null,
          externalUrl: this.buildPhraseProjectUrl(accountSlug, projectSlug),
          syncState: "synced",
          localeReadiness,
          providerPayload: {
            id: key.id,
            key: key.name,
            name: key.name,
            description: key.description,
            branch,
            tags: key.tags,
            customMetadata: key.customMetadata,
            nameHash: key.nameHash,
            plural: key.plural,
            useOrdinalRules: key.useOrdinalRules,
            dataType: key.dataType,
            createdAt: key.createdAt,
            updatedAt: key.updatedAt,
          },
        });
      }
    }

    return results;
  }

  /**
   * Lists Phrase TMS job parts as Hyperlocalise jobs.
   *
   * Optionally enriches each job with workflow-scoped translation memories and term bases.
   */
  async fetchJobTasks(scope: TmsProviderProjectScope) {
    const tmsProjectUid = resolvePhraseTmsProjectUid(scope.project, scope.externalProjectId);

    if (!tmsProjectUid) {
      throw new Error("invalid_phrase_project_id");
    }

    const client = this.createTmsClient(scope);
    const enrichResources = scope.enrichResources ?? true;

    let jobParts: PhraseTmsJobPart[];
    try {
      jobParts = await client.listAllJobParts(tmsProjectUid);
    } catch (error) {
      throw mapPhraseTmsFetcherError(error);
    }

    const projectTermBases = enrichResources
      ? await this.loadProjectTermBases(client, tmsProjectUid)
      : [];
    const resourceCache = new Map<string, JobResourceBundle>();

    return Promise.all(
      jobParts.map(async (jobPart) => {
        const resources = enrichResources
          ? await this.loadJobResources({
              client,
              projectUid: tmsProjectUid,
              jobPart,
              projectTermBases,
              cache: resourceCache,
            })
          : { translationMemories: [], termBases: [] };

        const targetLocale = jobPart.targetLang;
        const externalJobId = buildPhraseExternalJobId(jobPart.innerId, targetLocale);
        const assignedUsers = [
          jobPart.owner?.userName?.trim(),
          jobPart.owner?.email?.trim(),
        ].filter((value): value is string => Boolean(value));

        return {
          externalJobId,
          externalTaskId: jobPart.uid,
          externalStatus: jobPart.status,
          title: this.buildPhraseJobTitle(jobPart),
          dueDate: jobPart.dateDue ? new Date(jobPart.dateDue) : null,
          targetLocales: targetLocale ? [targetLocale] : [],
          assignedUsers,
          externalUrl: this.buildPhraseTmsJobUrl(
            client.resolvedBaseUrl,
            tmsProjectUid,
            jobPart.uid,
          ),
          providerPayload: {
            workflowStep: jobPart.workflowStep?.name ?? null,
            workflowStepDetails: jobPart.workflowStep,
            ...(enrichResources
              ? {
                  translationMemories: resources.translationMemories,
                  termBases: resources.termBases,
                }
              : {}),
            innerId: jobPart.innerId,
            filename: jobPart.filename,
            importStatus: jobPart.importStatus,
            dateCreated: jobPart.dateCreated,
            tmsProjectUid,
          },
          kind: this.mapPhraseTmsJobKind(jobPart.workflowStep?.name),
        };
      }),
    );
  }

  /**
   * Imports TMS term bases linked to the Phrase TMS project as glossary metadata rows.
   *
   * Terms are not bulk-imported; live search uses TMS APIs (`termCapabilities.mode =
   * "live_search"`).
   */
  async fetchGlossaries(scope: TmsProviderProjectScope) {
    const tmsProjectUid = resolvePhraseTmsProjectUid(scope.project, scope.externalProjectId);
    if (!tmsProjectUid) {
      throw new Error("invalid_phrase_tms_project_id");
    }

    const client = this.createTmsClient(scope);

    let termBases;
    try {
      termBases = await client.getProjectTermBases(tmsProjectUid);
    } catch (error) {
      if (error instanceof PhraseTmsApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale ?? "en";
    const targetLocales = scope.project.targetLocales ?? [];
    const glossaryTargetLocales =
      targetLocales.length > 0 ? this.uniqueLocales(targetLocales) : [sourceLocale];

    return termBases.flatMap((termBase) =>
      glossaryTargetLocales.map((targetLocale) => ({
        externalGlossaryId: termBase.uid,
        name: termBase.name || termBase.uid,
        description: "",
        sourceLocale,
        targetLocale,
        externalResourceType: "term_base" as const,
        localeCoverage: this.uniqueLocales([sourceLocale, targetLocale]),
        termCount: null,
        termCapabilities: { mode: "live_search" },
        metadata: {
          phraseTermBaseUid: termBase.uid,
          phraseTmsProjectUid: tmsProjectUid,
          phraseTermBaseId: termBase.id,
        },
        terms: [],
      })),
    );
  }

  /** Imports Phrase TMS translation memory metadata without segment bulk import. */
  async fetchTranslationMemories(scope: TmsProviderProjectScope) {
    const tmsProjectUid = resolvePhraseTmsProjectUid(scope.project, scope.externalProjectId);
    if (!tmsProjectUid) {
      throw new Error("invalid_phrase_tms_project_id");
    }

    const client = this.createTmsClient(scope);

    let memories;
    try {
      memories = await client.getProjectTranslationMemories({ projectUid: tmsProjectUid });
    } catch (error) {
      if (error instanceof PhraseTmsApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
      throw error;
    }

    const sourceLocale = scope.project.sourceLocale ?? "en";
    const targetLocales = scope.project.targetLocales ?? [];

    return memories.map((memory) => ({
      externalMemoryId: memory.uid,
      name: memory.name || memory.uid,
      description: "",
      sourceLocale,
      localeCoverage: this.uniqueLocales([sourceLocale, ...targetLocales]),
      segmentCount: null,
      metadata: {
        phraseTransMemoryUid: memory.uid,
        phraseTmsProjectUid: tmsProjectUid,
        phraseTransMemoryId: memory.id,
      },
      entries: [],
    }));
  }

  /**
   * Pulls job-scoped key content from Phrase Strings, correlating TMS job parts when linked.
   *
   * Keys are filtered by job tag when TMS inner id is known. Target locale is resolved from
   * the TMS job part or encoded external job id suffix.
   */
  async pullTaskContent(scope: TmsProviderJobScope) {
    const stringsProjectId = resolvePhraseStringsProjectId(scope.project, scope.externalProjectId);
    if (!stringsProjectId) {
      throw new Error("invalid_phrase_project_id");
    }

    const stringsClient = this.createStringsClient(scope);
    const branch = resolvePhraseBranch(scope.project);
    const listOptions = branch ? { branch } : {};

    let locales: PhraseLocale[];
    let keys: PhraseKey[];
    try {
      [locales, keys] = await Promise.all([
        stringsClient.listLocales(stringsProjectId, listOptions),
        stringsClient.listKeys(stringsProjectId, listOptions),
      ]);
    } catch (error) {
      throw this.mapPhraseStringsError(error);
    }

    const parsedJobId = parsePhraseExternalJobId(scope.externalJobId);
    if (!parsedJobId) {
      throw new Error("invalid_phrase_job_id");
    }

    let jobPart = null;
    const tmsProjectUid = resolvePhraseTmsProjectUid(scope.project, scope.externalProjectId);
    if (tmsProjectUid) {
      const tmsClient = this.createTmsClient(scope);

      try {
        const jobParts = await tmsClient.listAllJobParts(tmsProjectUid);
        jobPart = findPhraseTmsJobPart({ externalJobId: scope.externalJobId, jobParts });
      } catch (error) {
        throw mapPhraseTmsFetcherError(error);
      }
    }

    const targetLocale =
      (jobPart ? matchPhraseTargetLocale(jobPart.targetLang, locales) : null) ??
      locales.find(
        (locale) =>
          !locale.default &&
          normalizePhraseTaskLocaleSuffix(locale.code ?? locale.name) ===
            parsedJobId.taskLocaleSuffix,
      );
    if (!targetLocale) {
      throw new Error("phrase_task_missing_target_language");
    }

    const sourceLocaleRef = locales.find((locale) => locale.default) ?? null;
    const jobTag = buildPhraseJobScopeTag(parsedJobId.innerId);
    const scopedKeys = filterPhraseKeysForJobScope({ keys, jobTag });

    const localesToLoad = [sourceLocaleRef, targetLocale].filter(
      (locale): locale is PhraseLocale => locale != null,
    );

    const translationsByKeyId = await this.loadContentTranslationsByKeyId({
      client: stringsClient,
      projectId: stringsProjectId,
      locales: localesToLoad,
      branch,
      keyIds: scopedKeys.map((key) => key.id),
    });

    const units: ExternalTmsTaskContent["units"] = scopedKeys.map((key) => {
      const translationsByLocale = translationsByKeyId.get(key.id);
      const sourceTranslation = sourceLocaleRef
        ? translationsByLocale?.get(sourceLocaleRef.name)
        : null;
      const targetTranslation = translationsByLocale?.get(targetLocale.name);

      const sourceText = sourceTranslation?.content?.trim() || key.name;
      const targetEntries = [];

      if (targetTranslation?.content?.trim()) {
        const readiness = mapPhraseTranslationReadiness({
          content: targetTranslation.content,
          state: targetTranslation.state,
          unverified: targetTranslation.unverified,
          excluded: targetTranslation.excluded,
        });

        targetEntries.push({
          locale: targetLocale.code?.trim() || targetLocale.name,
          text: targetTranslation.content.trim(),
          externalTranslationId: targetTranslation.id,
          isApproved: readiness === "ready",
        });
      }

      return {
        externalStringId: key.id,
        key: key.name,
        sourceText,
        context: key.description,
        fileId: null,
        translations: targetEntries,
        providerPayload: {
          branch,
          jobTag,
          tags: key.tags,
          dataType: key.dataType,
          customMetadata: key.customMetadata,
        },
      };
    });

    return {
      externalJobId: scope.externalJobId,
      externalTaskId: jobPart?.uid ?? null,
      sourceLocale: sourceLocaleRef?.code?.trim() || sourceLocaleRef?.name || null,
      targetLocales: [targetLocale.code?.trim() || targetLocale.name],
      units,
      exportArtifact: null,
      providerPayload: {
        stringsProjectId,
        tmsProjectUid,
        branch,
        jobTag,
        innerId: parsedJobId.innerId,
        filename: jobPart?.filename ?? null,
        targetLang: jobPart?.targetLang ?? targetLocale.name,
        workflowStep: jobPart?.workflowStep?.name ?? null,
      },
    };
  }

  /** Uploads a source file to Phrase Strings for the resolved source locale and branch. */
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
    const client = this.createStringsClient(scope);
    const sourcePath = providerSourcePath(scope.file);
    const fileFormat = providerFileFormat(scope.file);
    if (!fileFormat) {
      return err({ code: "phrase_source_file_format_required" });
    }

    const locales = await client.listLocales(scope.externalProjectId, {
      branch: scope.file.branch,
    });
    const sourceLocale = this.resolvePhraseSourceLocale(
      scope.file,
      locales,
      scope.project.sourceLocale,
    );
    if (!sourceLocale) {
      return err({ code: "phrase_source_locale_not_found" });
    }

    const upload = await client.uploadSourceFile(scope.externalProjectId, {
      filename: providerFilename(scope.file),
      content: scope.file.content,
      contentType: scope.file.contentType,
      fileFormat,
      localeId: sourceLocale.id,
      branch: scope.file.branch,
    });

    return ok({
      sourcePath,
      externalResourceId: upload.id,
      revision: upload.updatedAt ?? upload.createdAt ?? null,
      providerPayload: {
        id: upload.id,
        filename: upload.filename,
        format: upload.format,
        state: upload.state,
        url: upload.url,
        sourceLocale: {
          id: sourceLocale.id,
          name: sourceLocale.name,
          code: sourceLocale.code,
        },
        branch: scope.file.branch?.trim() || null,
      },
    });
  }

  /**
   * Writes approved translations via Phrase Strings upsert API.
   *
   * Creates missing keys by name when needed and tags them with the job scope tag.
   */
  async pushTranslations(scope: TmsProviderPushTranslationsScope) {
    const stringsProjectId = resolvePhraseStringsProjectId(scope.project, scope.externalProjectId);
    if (!stringsProjectId) {
      throw new Error("invalid_phrase_project_id");
    }

    const parsedJobId = parsePhraseExternalJobId(scope.externalJobId);
    if (!parsedJobId) {
      throw new Error("invalid_phrase_job_id");
    }

    const branch = resolvePhraseBranch(scope.project);
    let defaultTargetLocale: string | null = null;

    const tmsProjectUid = resolvePhraseTmsProjectUid(scope.project, scope.externalProjectId);
    if (tmsProjectUid) {
      const tmsClient = this.createTmsClient(scope);

      try {
        const jobParts = await tmsClient.listAllJobParts(tmsProjectUid);
        const jobPart = findPhraseTmsJobPart({ externalJobId: scope.externalJobId, jobParts });
        defaultTargetLocale = jobPart?.targetLang?.trim() || null;
      } catch (error) {
        throw mapPhraseTmsFetcherError(error);
      }
    }

    const jobTag = buildPhraseJobScopeTag(parsedJobId.innerId);
    const { groups, failures: payloadFailures } = buildPhraseTranslationWriteBackGroups({
      translations: scope.translations,
      branch,
      jobTag,
      defaultTargetLocale,
    });

    const client = this.createStringsClient(scope);

    let uploaded = 0;
    let failed = payloadFailures.length;
    const failures = [...payloadFailures];
    const asyncOperations: Array<Record<string, unknown>> = [];

    let keysByName: KeysByName;
    try {
      keysByName = await this.loadKeysByName(client, stringsProjectId, branch);
    } catch (error) {
      throw this.mapPhraseStringsError(error);
    }

    for (const group of groups) {
      for (const entry of group.entries) {
        try {
          const resolvedKeyId = await this.resolvePhraseKeyId({
            client,
            projectId: stringsProjectId,
            keysByName,
            entry,
          });

          await client.upsertTranslation(stringsProjectId, {
            keyId: resolvedKeyId,
            localeName: entry.locale,
            content: entry.text,
            branch: entry.branch,
            unverified: false,
          });

          uploaded += 1;
          asyncOperations.push({
            type: "phrase_upsert_translation",
            keyId: resolvedKeyId,
            locale: entry.locale,
            branch: entry.branch,
            jobTag: entry.jobTag,
            status: "succeeded",
          });
        } catch (error) {
          failed += 1;
          failures.push({
            locale: entry.locale,
            fileId: null,
            message: error instanceof Error ? error.message : "phrase translation upload failed",
          });
          asyncOperations.push({
            type: "phrase_upsert_translation",
            locale: entry.locale,
            branch: entry.branch,
            jobTag: entry.jobTag,
            status: "failed",
            error: error instanceof Error ? error.message : "phrase translation upload failed",
          });
        }
      }
    }

    return { uploaded, failed, failures, asyncOperations };
  }

  /**
   * Pulls TMS LQA/plain conversations and Strings key comments into one review report.
   *
   * Key comment threads include reply chains when Phrase exposes them.
   */
  async pullReview(scope: TmsProviderPullReviewScope): Promise<ProviderReviewReport> {
    if (!scope.externalProjectId.trim() || !scope.externalJobId.trim()) {
      throw new Error("invalid_phrase_project_or_job_id");
    }

    if (!parsePhraseExternalJobId(scope.externalJobId)) {
      throw new Error("invalid_phrase_external_job_id");
    }

    const stringsProjectId = resolvePhraseStringsProjectId(scope.project, scope.externalProjectId);
    const tmsProjectUid = resolvePhraseTmsProjectUid(scope.project, scope.externalProjectId);
    const branch = resolvePhraseBranch(scope.project);
    const { accountSlug, projectSlug } = this.resolvePhraseProjectSlugs(scope.project);

    const stringsClient = this.createStringsClient(scope);
    const tmsClient = this.createTmsClient(scope);

    const stringKeyById = new Map(
      scope.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
    );

    const keyIds = new Set<string>();
    for (const unit of scope.content.units) {
      const keyId = unit.externalStringId.trim();
      if (keyId) {
        keyIds.add(keyId);
      }
    }

    let jobProviderUrl: string | null = null;
    let targetLocale: string | null = scope.content.targetLocales[0]?.trim() || null;

    const tmsThreads: ReturnType<typeof normalizePhraseLqaConversationToThread>[] = [];

    if (tmsProjectUid) {
      try {
        const jobParts = await tmsClient.listAllJobParts(tmsProjectUid);
        const jobPart = findPhraseTmsJobPart({
          externalJobId: scope.externalJobId,
          jobParts,
        });

        if (jobPart) {
          targetLocale = jobPart.targetLang.trim() || targetLocale;
          jobProviderUrl = buildPhraseTmsJobProviderUrl({
            tmsBaseUrl: tmsClient.resolvedBaseUrl,
            projectUid: tmsProjectUid,
            jobUid: jobPart.uid,
          });

          const [lqaConversations, plainConversations] = await Promise.all([
            tmsClient.listLqaConversations(jobPart.uid),
            tmsClient.listPlainConversations(jobPart.uid),
          ]);

          for (const conversation of lqaConversations) {
            tmsThreads.push(
              normalizePhraseLqaConversationToThread({
                conversation,
                externalProjectId: scope.externalProjectId,
                externalJobId: scope.externalJobId,
                jobProviderUrl,
                targetLocale,
              }),
            );
          }

          for (const conversation of plainConversations) {
            tmsThreads.push(
              normalizePhrasePlainConversationToThread({
                conversation,
                externalProjectId: scope.externalProjectId,
                externalJobId: scope.externalJobId,
                jobProviderUrl,
                targetLocale,
              }),
            );
          }
        }
      } catch (error) {
        this.rethrowPhraseReviewPullError(error);
      }
    }

    const keyCommentThreads: ReturnType<typeof normalizePhraseKeyCommentToThread>[] = [];
    const keyIdList = [...keyIds];

    if (keyIdList.length > 0 && stringsProjectId) {
      try {
        const listOptions = { branch };

        for (const chunk of this.chunkArray(keyIdList, PHRASE_REVIEW_KEY_COMMENT_CHUNK_SIZE)) {
          const chunkResults = await Promise.all(
            chunk.map(async (keyId) => {
              const comments = await stringsClient.listKeyComments(
                stringsProjectId,
                keyId,
                listOptions,
              );
              const keyProviderUrl = buildPhraseStringsKeyProviderUrl({
                accountSlug,
                projectSlug,
                keyId,
              });

              const threadsForKey = await Promise.all(
                comments.map(async (comment) => {
                  const replies =
                    comment.hasReplies && comment.id.trim()
                      ? await stringsClient.listCommentReplies(
                          stringsProjectId,
                          keyId,
                          comment.id,
                          listOptions,
                        )
                      : [];

                  return normalizePhraseKeyCommentToThread({
                    comment,
                    replies,
                    keyId,
                    externalProjectId: scope.externalProjectId,
                    externalJobId: scope.externalJobId,
                    stringKeyById,
                    keyProviderUrl,
                  });
                }),
              );

              return threadsForKey;
            }),
          );

          for (const threads of chunkResults) {
            keyCommentThreads.push(...threads);
          }
        }
      } catch (error) {
        this.rethrowPhraseReviewPullError(error);
      }
    }

    const threads = [...tmsThreads, ...keyCommentThreads].filter(
      (thread): thread is NonNullable<typeof thread> => thread != null,
    );

    const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));

    return buildProviderReviewReport([...deduped.values()]);
  }

  /** Live TM search via Phrase TMS job segment search API (`externalJobUid` required). */
  async searchTranslationMemoryMatches(input: ExternalTmsTranslationMemoryMatcherInput) {
    const jobUid = input.externalJobUid?.trim();
    if (!jobUid || !input.project) {
      return [];
    }

    const tmsProjectUid = resolvePhraseTmsProjectUid(input.project, input.externalProjectId);
    if (!tmsProjectUid) {
      return [];
    }

    const client = this.createTmsClient(input);

    let results;
    try {
      results = await client.searchJobTranslationMemorySegment({
        projectUid: tmsProjectUid,
        jobUid,
        segment: input.sourceText,
        maxSegments: Math.min(input.limit, 5),
      });
    } catch (error) {
      if (error instanceof PhraseTmsApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
      return [];
    }

    const externalMemoryId = input.memory.externalMemoryId;
    const filtered = externalMemoryId
      ? results.filter((result) => result.transMemoryUid === externalMemoryId)
      : results;

    const memoryIdByExternalUid = new Map<string, string>();
    if (externalMemoryId) {
      memoryIdByExternalUid.set(externalMemoryId, input.memory.id);
    }

    const normalized = normalizePhraseTranslationMemorySearchMatches(filtered, {
      targetLocale: input.targetLocale,
      memoryIdByExternalUid,
    });

    return normalized.slice(0, input.limit).map((match, index) =>
      normalizeProviderTranslationMemoryMatch({
        sourceText: match.sourceText,
        targetText: match.targetText,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        matchScore: normalizePhraseMatchScore(match.matchScore),
        providerKind: this.kind,
        resourceId: input.memory.id,
        externalResourceId: match.externalResourceId,
        externalSegmentId: match.id,
        memoryName: input.memory.name,
        rank: 1 - index * 0.01,
      }),
    );
  }

  /**
   * Loads screenshot visual context for a Phrase key.
   *
   * Prefers key-scoped screenshots; falls back to scanning project screenshots and markers.
   */
  async loadCatVisualContext(input: {
    client: PhraseApiClient;
    externalProjectId: string;
    externalStringId: string;
  }): Promise<CatVisualContext> {
    const keyScreenshots = await this.loadPhraseKeyScreenshots(input);
    if (keyScreenshots) {
      const mapped = await mapWithConcurrency(
        keyScreenshots.filter((screenshot) => screenshot.screenshotUrl),
        PHRASE_MARKER_FETCH_CONCURRENCY,
        async (screenshot) => {
          if (screenshot.markers) {
            const keyMarkers = screenshot.markers.filter(
              (marker) => marker.keyId === input.externalStringId,
            );
            if (keyMarkers.length === 0) {
              return null;
            }

            return this.mapPhraseScreenshot(screenshot, keyMarkers);
          }

          const markers = await input.client.listScreenshotMarkers(
            input.externalProjectId,
            screenshot.id,
          );
          const keyMarkers = markers.filter((marker) => marker.keyId === input.externalStringId);
          if (keyMarkers.length === 0) {
            return null;
          }

          return this.mapPhraseScreenshot(screenshot, keyMarkers);
        },
      );

      return {
        screenshots: mapped
          .filter((screenshot): screenshot is CatVisualContextScreenshot => screenshot != null)
          .slice(0, MAX_PHRASE_SCREENSHOTS_PER_SEGMENT),
      };
    }

    const screenshots = await input.client.listScreenshots(input.externalProjectId, {
      maxItems: MAX_PHRASE_SCREENSHOTS_TO_SCAN,
    });
    const candidates = screenshots.filter(
      (screenshot) => screenshot.markersCount > 0 && screenshot.screenshotUrl,
    );

    const matched = await mapWithConcurrency(
      candidates,
      PHRASE_MARKER_FETCH_CONCURRENCY,
      async (screenshot) => {
        const markers = await input.client.listScreenshotMarkers(
          input.externalProjectId,
          screenshot.id,
        );
        const keyMarkers = markers.filter((marker) => marker.keyId === input.externalStringId);
        if (keyMarkers.length === 0) {
          return null;
        }

        return this.mapPhraseScreenshot(screenshot, keyMarkers);
      },
    );

    return {
      screenshots: matched
        .filter((screenshot): screenshot is CatVisualContextScreenshot => screenshot != null)
        .slice(0, MAX_PHRASE_SCREENSHOTS_PER_SEGMENT),
    };
  }

  private rethrowStringsAuthError(error: unknown): never {
    if (error instanceof PhraseApiError && error.status === 401) {
      throw new Error("phrase_auth_invalid");
    }

    throw error;
  }

  private rethrowPhraseReviewPullError(error: unknown): never {
    if (error instanceof PhraseTmsApiError || error instanceof PhraseApiError) {
      if (error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
      if (error.status === 429) {
        throw new Error("phrase_rate_limited");
      }
    }

    throw error;
  }

  private mapPhraseStringsError(error: unknown) {
    if (error instanceof PhraseApiError && error.status === 401) {
      return new Error("phrase_auth_invalid");
    }

    return error instanceof Error ? error : new Error("phrase_fetch_failed");
  }

  private mapPhraseFetcherError(error: unknown) {
    if (error instanceof PhraseApiError && error.status === 401) {
      return new Error("phrase_auth_invalid");
    }

    return error instanceof Error ? error : new Error("phrase_fetch_failed");
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

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private partitionProjectLocales(locales: PhraseLocale[]) {
    const source = locales.find((locale) => locale.default);
    const sourceLocale = this.localeIdentifier(source);
    const targetLocales = locales
      .filter((locale) => !locale.default)
      .map((locale) => this.localeIdentifier(locale))
      .filter((locale): locale is string => Boolean(locale));

    return {
      sourceLocale,
      targetLocales,
    };
  }

  private partitionFileLocales(locales: PhraseLocale[]) {
    const source = locales.find((locale) => locale.default);
    const sourceLocaleRef = source ?? null;
    const sourceLocale = this.localeIdentifier(source);
    const targetLocaleRefs = locales.filter((locale) => !locale.default);
    const targetLocales = targetLocaleRefs
      .map((locale) => this.localeIdentifier(locale))
      .filter((locale): locale is string => Boolean(locale));

    return {
      sourceLocale,
      targetLocales,
      targetLocaleRefs,
      sourceLocaleRef,
    };
  }

  private localeIdentifier(locale: PhraseLocale | undefined) {
    if (!locale) return null;
    return locale.code?.trim() || locale.name.trim() || null;
  }

  private buildPhraseProjectUrlFromProject(project: {
    slug: string;
    account: { slug: string } | null;
  }) {
    if (!project.account?.slug) return null;
    return `https://app.phrase.com/accounts/${project.account.slug}/projects/${project.slug}`;
  }

  private buildPhraseProjectUrl(accountSlug: string | null, projectSlug: string | null) {
    if (!accountSlug || !projectSlug) {
      return null;
    }

    return `https://app.phrase.com/accounts/${accountSlug}/projects/${projectSlug}`;
  }

  private buildBranchScopes(branches: string[]) {
    const unique = new Set<string>();
    for (const branch of branches) {
      const trimmed = branch.trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    }

    return [null, ...unique] as Array<string | null>;
  }

  private buildUploadExternalResourceId(uploadId: string, branch: string | null) {
    const trimmedBranch = branch?.trim();
    if (!trimmedBranch) {
      return uploadId;
    }

    return `${trimmedBranch}::${uploadId}`;
  }

  private mergeTags(tags: string[], tag: string | null) {
    const merged = new Set(tags);
    if (tag?.trim()) {
      merged.add(tag.trim());
    }

    return [...merged];
  }

  private async loadFileTranslationsByKeyId(input: {
    client: PhraseApiClient;
    projectId: string;
    locales: PhraseLocale[];
    branch: string | null;
  }) {
    const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
    const listOptions = input.branch ? { branch: input.branch } : {};
    const targetLocales = input.locales.filter((locale) => !locale.default);

    await mapWithConcurrency(targetLocales, FILE_LOCALE_FETCH_CONCURRENCY, async (locale) => {
      try {
        const translations = await input.client.listTranslations(
          input.projectId,
          locale.name,
          listOptions,
        );

        for (const translation of translations) {
          if (!translation.keyId) {
            continue;
          }

          const byLocale =
            translationsByKeyId.get(translation.keyId) ?? new Map<string, PhraseTranslation>();
          byLocale.set(locale.name, translation);
          translationsByKeyId.set(translation.keyId, byLocale);
        }
      } catch (error) {
        if (error instanceof PhraseApiError && error.status === 401) {
          throw new Error("phrase_auth_invalid");
        }
        throw error;
      }
    });

    return translationsByKeyId;
  }

  private buildKeyLocaleReadiness(input: {
    keyId: string;
    targetLocaleRefs: PhraseLocale[];
    translationsByKeyId: Map<string, Map<string, PhraseTranslation>>;
  }) {
    const localeReadiness: Record<string, string> = {};
    const translationsByLocale = input.translationsByKeyId.get(input.keyId);

    for (const locale of input.targetLocaleRefs) {
      const localeKey = this.localeIdentifier(locale) ?? locale.name;
      const translation = translationsByLocale?.get(locale.name);
      localeReadiness[localeKey] = mapPhraseTranslationReadiness({
        content: translation?.content,
        state: translation?.state,
        unverified: translation?.unverified,
        excluded: translation?.excluded,
      });
    }

    return localeReadiness;
  }

  private buildUploadLocaleReadiness(input: {
    keys: PhraseKey[];
    uploadsTags: string[];
    targetLocaleRefs: PhraseLocale[];
    translationsByKeyId: Map<string, Map<string, PhraseTranslation>>;
  }) {
    const scopedKeys =
      input.uploadsTags.length === 0
        ? input.keys
        : input.keys.filter((key) => key.tags.some((tag) => input.uploadsTags.includes(tag)));

    const localeReadiness: Record<string, string> = {};
    for (const locale of input.targetLocaleRefs) {
      const localeKey = this.localeIdentifier(locale) ?? locale.name;
      const statuses = scopedKeys.map((key) => {
        const translation = input.translationsByKeyId.get(key.id)?.get(locale.name);
        return mapPhraseTranslationReadiness({
          content: translation?.content,
          state: translation?.state,
          unverified: translation?.unverified,
          excluded: translation?.excluded,
        });
      });

      if (statuses.length === 0) {
        localeReadiness[localeKey] = "missing";
        continue;
      }

      const activeStatuses = statuses.filter((status) => status !== "excluded");

      if (activeStatuses.length === 0) {
        localeReadiness[localeKey] = "excluded";
        continue;
      }

      if (activeStatuses.every((status) => status === "ready")) {
        localeReadiness[localeKey] = "ready";
        continue;
      }

      if (activeStatuses.some((status) => status === "ready" || status === "unverified")) {
        localeReadiness[localeKey] = "unverified";
        continue;
      }

      localeReadiness[localeKey] = "missing";
    }

    return localeReadiness;
  }

  private async loadContentTranslationsByKeyId(input: {
    client: PhraseApiClient;
    projectId: string;
    locales: PhraseLocale[];
    branch: string | null;
    keyIds: string[];
  }) {
    const keyIdSet = new Set(input.keyIds);
    const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
    const listOptions = input.branch ? { branch: input.branch } : {};
    if (keyIdSet.size === 0) return translationsByKeyId;

    await mapWithConcurrency(input.locales, CONTENT_LOCALE_FETCH_CONCURRENCY, async (locale) => {
      try {
        const translations = await input.client.listTranslations(
          input.projectId,
          locale.name,
          listOptions,
        );

        for (const translation of translations) {
          if (!translation.keyId || !keyIdSet.has(translation.keyId)) {
            continue;
          }

          const byLocale =
            translationsByKeyId.get(translation.keyId) ?? new Map<string, PhraseTranslation>();
          byLocale.set(locale.name, translation);
          translationsByKeyId.set(translation.keyId, byLocale);
        }
      } catch (error) {
        throw this.mapPhraseStringsError(error);
      }
    });

    return translationsByKeyId;
  }

  private async loadProjectTermBases(client: PhraseTmsApiClient, projectUid: string) {
    try {
      return await client.getProjectTermBases(projectUid);
    } catch {
      return [];
    }
  }

  private async loadJobResources(input: {
    client: PhraseTmsApiClient;
    projectUid: string;
    jobPart: PhraseTmsJobPart;
    projectTermBases: PhraseTmsResourceReference[];
    cache: Map<string, JobResourceBundle>;
  }) {
    const cacheKey = [
      input.projectUid,
      input.jobPart.targetLang,
      input.jobPart.workflowStep?.id ?? "default",
    ].join(":");

    const cached = input.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [translationMemories, jobTermBases] = await Promise.all([
      input.client
        .getProjectTranslationMemories({
          projectUid: input.projectUid,
          targetLang: input.jobPart.targetLang || null,
          workflowStepUid: input.jobPart.workflowStep?.id ?? null,
        })
        .catch(() => [] as PhraseTmsResourceReference[]),
      Promise.resolve(input.projectTermBases),
    ]);

    const bundle = {
      translationMemories,
      termBases: jobTermBases,
    };
    input.cache.set(cacheKey, bundle);
    return bundle;
  }

  private buildPhraseJobTitle(jobPart: PhraseTmsJobPart) {
    const filename = jobPart.filename.trim() || "Untitled job";
    if (!jobPart.targetLang.trim()) {
      return filename;
    }

    return `${filename} (${jobPart.targetLang})`;
  }

  private buildPhraseTmsJobUrl(baseUrl: string, projectUid: string, jobUid: string) {
    return `${baseUrl}/project2/translate/${encodeURIComponent(projectUid)}/job/${encodeURIComponent(jobUid)}`;
  }

  private mapPhraseTmsJobKind(
    workflowStepName: string | null | undefined,
  ): "translation" | "review" | "proofread" {
    const tokens = (workflowStepName ?? "")
      .toLowerCase()
      .trim()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0);

    if (tokens.some((token) => PHRASE_TMS_PROOFREAD_STEP_TOKENS.has(token))) {
      return "proofread";
    }

    if (tokens.some((token) => PHRASE_TMS_REVIEW_STEP_TOKENS.has(token))) {
      return "review";
    }

    return "translation";
  }

  private resolvePhraseSourceLocale(
    file: ExternalTmsSourceFileUpload,
    locales: PhraseLocale[],
    projectSourceLocale: string | null,
  ) {
    const requested = file.sourceLocale?.trim() || projectSourceLocale?.trim() || "";
    if (requested) {
      const lower = requested.toLowerCase();
      const match = locales.find(
        (locale) =>
          locale.id.toLowerCase() === lower ||
          locale.name.toLowerCase() === lower ||
          locale.code?.toLowerCase() === lower,
      );
      if (match) {
        return match;
      }
    }

    return locales.find((locale) => locale.default) ?? null;
  }

  private async loadKeysByName(client: PhraseApiClient, projectId: string, branch: string | null) {
    const listOptions = branch ? { branch } : {};
    const keys = await client.listKeys(projectId, listOptions);
    const keysByName = new Map<string, { id: string; tags: string[] }>();

    for (const key of keys) {
      keysByName.set(this.buildKeyLookup(key.name), {
        id: key.id,
        tags: key.tags,
      });
    }

    return keysByName;
  }

  private async resolvePhraseKeyId(input: {
    client: PhraseApiClient;
    projectId: string;
    keysByName: KeysByName;
    entry: {
      key: string;
      keyId: string | null;
      branch: string | null;
      jobTag: string | null;
    };
  }) {
    if (input.entry.keyId) {
      const lookup = this.buildKeyLookup(input.entry.key);
      const byName = input.keysByName.get(lookup);
      if (byName && byName.id !== input.entry.keyId) {
        throw new Error("phrase_translation_key_id_mismatch");
      }

      let keyNameForId: string | null = null;
      for (const [name, key] of input.keysByName) {
        if (key.id === input.entry.keyId) {
          keyNameForId = name;
          break;
        }
      }

      if (keyNameForId !== null && keyNameForId !== lookup) {
        throw new Error("phrase_translation_key_id_mismatch");
      }

      return input.entry.keyId;
    }

    const lookup = this.buildKeyLookup(input.entry.key);
    const existing = input.keysByName.get(lookup);
    if (existing) {
      return existing.id;
    }

    const tags = input.entry.jobTag ? [input.entry.jobTag] : [];
    const created = await input.client.createKey(input.projectId, {
      name: input.entry.key,
      tags,
      branch: input.entry.branch,
    });

    input.keysByName.set(lookup, { id: created.id, tags: created.tags });
    return created.id;
  }

  private buildKeyLookup(name: string) {
    return name.trim();
  }

  private resolvePhraseProjectSlugs(project: TmsProviderProjectScope["project"]) {
    const metadata = project.providerMetadata ?? {};
    const accountSlug =
      typeof metadata.accountSlug === "string" ? metadata.accountSlug.trim() : null;
    const projectSlug = typeof metadata.slug === "string" ? metadata.slug.trim() : null;

    return { accountSlug: accountSlug || null, projectSlug: projectSlug || null };
  }

  private async loadPhraseKeyScreenshots(input: {
    client: PhraseApiClient;
    externalProjectId: string;
    externalStringId: string;
  }): Promise<PhraseKeyScreenshot[] | null> {
    try {
      return await input.client.listKeyScreenshots(
        input.externalProjectId,
        input.externalStringId,
        {
          maxItems: MAX_PHRASE_SCREENSHOTS_PER_SEGMENT,
        },
      );
    } catch (error) {
      if (error instanceof PhraseApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  /** Builds a paginated live CAT queue file (delegates to {@link buildPhraseLiveCatFile}). */
  async buildLiveCatFile(input: {
    secretMaterial: string;
    region?: string | null;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    canEditTranslations: boolean;
    pagination?: ProjectFileCatPaginationInput;
  }): Promise<ProjectFileCatQueueFile> {
    return buildPhraseLiveCatFile(input);
  }

  /** Loads the current target translation for one CAT segment (delegates to module helper). */
  async getLiveCatSegmentTarget(input: {
    secretMaterial: string;
    region?: string | null;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
  }): Promise<ProjectFileCatTranslation | null | "not_found"> {
    return getPhraseLiveCatSegmentTarget(input);
  }

  /** Lists key comments for one CAT segment (delegates to module helper). */
  async getLiveCatSegmentComments(input: {
    secretMaterial: string;
    region?: string | null;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
  }): Promise<ProjectFileCatComment[]> {
    return getPhraseLiveCatSegmentComments(input);
  }

  /** Saves an approved target translation for one CAT segment (delegates to module helper). */
  async saveLiveCatTranslation(input: {
    secretMaterial: string;
    region?: string | null;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
    text: string;
  }): Promise<ProjectFileCatTranslation> {
    return savePhraseLiveCatTranslation(input);
  }

  /** Creates a key comment from the live CAT editor (delegates to module helper). */
  async saveLiveCatComment(input: {
    secretMaterial: string;
    region?: string | null;
    baseUrl?: string | null;
    externalProjectId: string;
    file: TmsProviderLiveFile;
    targetLocale: string;
    externalStringId: string;
    text: string;
  }): Promise<ProjectFileCatComment> {
    return savePhraseLiveCatComment(input);
  }

  private mapPhraseScreenshot(
    screenshot:
      | Awaited<ReturnType<PhraseApiClient["listScreenshots"]>>[number]
      | Awaited<ReturnType<PhraseApiClient["listKeyScreenshots"]>>[number],
    markers: Awaited<ReturnType<PhraseApiClient["listScreenshotMarkers"]>>,
  ): CatVisualContextScreenshot | null {
    const imageUrl = screenshot.screenshotUrl?.trim();
    if (!imageUrl) {
      return null;
    }

    const mappedMarkers = markers
      .map((marker): CatVisualContextMarker | null => {
        if (
          !Number.isFinite(marker.left) ||
          !Number.isFinite(marker.top) ||
          !Number.isFinite(marker.width) ||
          !Number.isFinite(marker.height) ||
          marker.width <= 0 ||
          marker.height <= 0
        ) {
          return null;
        }

        return {
          left: marker.left,
          top: marker.top,
          width: marker.width,
          height: marker.height,
        };
      })
      .filter((marker): marker is CatVisualContextMarker => marker != null);

    return {
      id: screenshot.id,
      name: screenshot.name,
      imageUrl,
      width: null,
      height: null,
      markers: mappedMarkers,
    };
  }
}

// --- Module-level helpers (exported for unit tests) ---

/** Pattern for Hyperlocalise-encoded Phrase external job ids: `{innerId}-task-{localeSuffix}`. */
const PHRASE_EXTERNAL_JOB_ID_PATTERN = /^(.+)-task-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Parses {@link buildPhraseExternalJobId} values back into inner id and locale suffix. */
export function parsePhraseExternalJobId(externalJobId: string) {
  const match = externalJobId.trim().match(PHRASE_EXTERNAL_JOB_ID_PATTERN);
  if (!match) {
    return null;
  }

  return {
    innerId: match[1],
    taskLocaleSuffix: match[2],
  };
}

/** Normalizes a TMS target language code into the locale suffix used in external job ids. */
export function normalizePhraseTaskLocaleSuffix(targetLang: string) {
  const normalized = targetLang.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Builds the Hyperlocalise external job id for a Phrase TMS job part. */
export function buildPhraseExternalJobId(innerId: string, targetLang: string) {
  return `${innerId.trim()}-task-${normalizePhraseTaskLocaleSuffix(targetLang)}`;
}

/** Tag applied to Phrase keys created or updated during job-scoped write-back. */
export function buildPhraseJobScopeTag(innerId: string) {
  return `hyperlocalise:job:${innerId.trim()}`;
}

/** Resolves Phrase Strings project id from provider metadata, falling back to external id. */
export function resolvePhraseStringsProjectId(
  project: { providerMetadata: Record<string, unknown> },
  externalProjectId: string,
) {
  const metadata = project.providerMetadata ?? {};
  const stringsProjectId =
    typeof metadata.stringsProjectId === "string" ? metadata.stringsProjectId.trim() : "";
  if (stringsProjectId) {
    return stringsProjectId;
  }

  return externalProjectId.trim();
}

/**
 * Resolves Phrase TMS project uid from provider metadata.
 *
 * Returns `null` when metadata indicates a Strings-only project link.
 */
export function resolvePhraseTmsProjectUid(
  project: { providerMetadata: Record<string, unknown> },
  externalProjectId: string,
): string | null {
  const metadata = project.providerMetadata ?? {};
  const tmsProjectUid =
    typeof metadata.tmsProjectUid === "string" ? metadata.tmsProjectUid.trim() : "";
  if (tmsProjectUid) {
    return tmsProjectUid;
  }

  const stringsProjectId =
    typeof metadata.stringsProjectId === "string" ? metadata.stringsProjectId.trim() : "";
  if (stringsProjectId) {
    return null;
  }

  const fallback = externalProjectId.trim();
  return fallback || null;
}

/** Reads default branch name from project provider metadata, if configured. */
export function resolvePhraseBranch(project: { providerMetadata: Record<string, unknown> }) {
  const metadata = project.providerMetadata ?? {};
  if (typeof metadata.defaultBranch === "string" && metadata.defaultBranch.trim()) {
    return metadata.defaultBranch.trim();
  }
  if (typeof metadata.branch === "string" && metadata.branch.trim()) {
    return metadata.branch.trim();
  }

  return null;
}

/** Matches a TMS target language string to a Phrase Strings locale record. */
export function matchPhraseTargetLocale(targetLang: string, locales: PhraseLocale[]) {
  const normalized = targetLang.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const locale of locales) {
    if (locale.name.trim().toLowerCase() === normalized) {
      return locale;
    }
    if (locale.code?.trim().toLowerCase() === normalized) {
      return locale;
    }
  }

  const suffix = normalizePhraseTaskLocaleSuffix(targetLang);
  for (const locale of locales) {
    if (normalizePhraseTaskLocaleSuffix(locale.code ?? locale.name) === suffix) {
      return locale;
    }
  }

  return null;
}

/** Finds the TMS job part corresponding to a Hyperlocalise external job id. */
export function findPhraseTmsJobPart(input: {
  externalJobId: string;
  jobParts: PhraseTmsJobPart[];
}) {
  const parsed = parsePhraseExternalJobId(input.externalJobId);
  if (!parsed) {
    return null;
  }

  return (
    input.jobParts.find(
      (jobPart) =>
        jobPart.innerId === parsed.innerId &&
        normalizePhraseTaskLocaleSuffix(jobPart.targetLang) === parsed.taskLocaleSuffix,
    ) ?? null
  );
}

/** Filters keys to those tagged for a job scope, or returns all keys when tag is absent. */
export function filterPhraseKeysForJobScope<T extends { tags: string[] }>(input: {
  keys: T[];
  jobTag: string | null;
}) {
  if (!input.jobTag) {
    return input.keys;
  }

  return input.keys.filter((key) => key.tags.includes(input.jobTag as string));
}

/** Readiness state derived from Phrase translation fields for sync and CAT UI. */
export type PhraseLocaleReadinessStatus = "ready" | "missing" | "unverified" | "excluded";

/** Maps Phrase translation state into Hyperlocalise locale readiness labels. */
export function mapPhraseTranslationReadiness(input: {
  content?: string | null;
  state?: string | null;
  unverified?: boolean;
  excluded?: boolean;
}): PhraseLocaleReadinessStatus {
  if (input.excluded) {
    return "excluded";
  }

  const content = input.content?.trim();
  if (!content) {
    return "missing";
  }

  if (input.unverified) {
    return "unverified";
  }

  const state = (input.state ?? "").trim().toLowerCase();
  if (state === "translated") {
    return "ready";
  }

  return "unverified";
}

/** Parses branch-prefixed external resource ids (`branch::resourceId`). */
export function parsePhraseExternalResourceId(externalResourceId: string) {
  const trimmed = externalResourceId.trim();
  const separatorIndex = trimmed.indexOf("::");
  if (separatorIndex === -1) {
    return {
      branch: null as string | null,
      resourceId: trimmed,
    };
  }

  const branch = trimmed.slice(0, separatorIndex).trim() || null;
  const resourceId = trimmed.slice(separatorIndex + 2).trim();
  return {
    branch,
    resourceId,
  };
}

/** Builds external resource id for a Phrase key, optionally prefixed with branch name. */
export function buildPhraseKeyExternalResourceId(keyId: string, branch: string | null) {
  const trimmedId = keyId.trim();
  const trimmedBranch = branch?.trim();
  if (!trimmedBranch) {
    return trimmedId;
  }

  return `${trimmedBranch}::${trimmedId}`;
}

/** Encodes a Phrase branch name for use as a single source-path segment. */
export function encodePhraseBranchPathSegment(branch: string) {
  return encodeURIComponent(branch.trim());
}

function buildPhraseBranchScopedPath(branch: string | null, relativePath: string) {
  const trimmedBranch = branch?.trim();
  if (!trimmedBranch) {
    return relativePath;
  }

  return `branches/${encodePhraseBranchPathSegment(trimmedBranch)}/${relativePath}`;
}

/** Canonical Hyperlocalise source path for a Phrase key resource. */
export function buildPhraseKeySourcePath(keyName: string, branch: string | null) {
  const trimmedName = keyName.trim();
  return buildPhraseBranchScopedPath(branch, `keys/${trimmedName}`);
}

/** Canonical Hyperlocalise source path for a Phrase upload (file) resource. */
export function buildPhraseUploadSourcePath(
  sourceLocale: string | null,
  filename: string,
  branch: string | null = null,
) {
  const trimmedFilename = filename.trim();
  const trimmedLocale = sourceLocale?.trim();
  const basePath = trimmedLocale
    ? `locales/${trimmedLocale}/${trimmedFilename}`
    : `uploads/${trimmedFilename}`;

  return buildPhraseBranchScopedPath(branch, basePath);
}

/** Normalizes Phrase TMS match scores to 0–100 integer percentages. */
export function normalizePhraseMatchScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) {
    return null;
  }

  if (score <= 1) {
    return Math.max(0, Math.min(100, Math.round(score * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Normalizes Phrase TMS TM search hits into translation context snapshot matches. */
export function normalizePhraseTranslationMemorySearchMatches(
  matches: PhraseTmsSearchSegmentResult[],
  input: {
    targetLocale: string;
    memoryIdByExternalUid: Map<string, string>;
    rankOffset?: number;
  },
): StringTranslationContextSnapshot["translationMemoryMatches"] {
  const normalized: StringTranslationContextSnapshot["translationMemoryMatches"] = [];
  let index = input.rankOffset ?? 0;

  for (const match of matches) {
    if (input.targetLocale && match.targetLocale && match.targetLocale !== input.targetLocale) {
      continue;
    }

    const externalMemoryUid = match.transMemoryUid;
    if (!externalMemoryUid) {
      continue;
    }

    const memoryId = input.memoryIdByExternalUid.get(externalMemoryUid);
    if (!memoryId) {
      continue;
    }

    normalized.push({
      id: `phrase:tm:${externalMemoryUid}:${match.segmentId ?? index}:${input.targetLocale}`,
      memoryId,
      memoryName: match.transMemoryName ?? externalMemoryUid,
      sourceText: match.sourceText,
      targetText: match.targetText,
      targetLocale: input.targetLocale,
      provenance: "phrase_tm_search",
      matchScore: normalizePhraseMatchScore(match.score),
      rank: Math.max(1, 100 - index),
      matchSource: "live_provider",
      providerKind: "phrase",
      resourceId: memoryId,
      externalResourceId: externalMemoryUid,
    });
    index += 1;
  }

  return normalized;
}

/** Deep link to a Phrase TMS job in the web UI. */
export function buildPhraseTmsJobProviderUrl(input: {
  tmsBaseUrl: string;
  projectUid: string;
  jobUid: string;
}) {
  const base = input.tmsBaseUrl.replace(/\/+$/g, "");
  return `${base}/project2/translate/${encodeURIComponent(input.projectUid)}/job/${encodeURIComponent(input.jobUid)}`;
}

/** Deep link to a Phrase Strings key in the web UI. */
export function buildPhraseStringsKeyProviderUrl(input: {
  accountSlug: string | null;
  projectSlug: string | null;
  keyId: string;
}) {
  if (!input.accountSlug || !input.projectSlug) {
    return null;
  }

  return `https://app.phrase.com/accounts/${input.accountSlug}/projects/${input.projectSlug}/keys/${encodeURIComponent(input.keyId)}`;
}

function mapPhraseTmsUser(
  user: PhraseTmsConversationUser | null | undefined,
): ProviderReviewAuthor | null {
  if (!user) {
    return null;
  }

  const externalUserId = user.uid?.trim() || user.userName?.trim() || null;
  if (!externalUserId) {
    return null;
  }

  const displayName = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return {
    externalUserId,
    username: user.userName?.trim() || null,
    displayName: displayName || user.userName?.trim() || null,
  };
}

function mapPhraseStringsUser(
  user: PhraseUserPreview | null | undefined,
): ProviderReviewAuthor | null {
  if (!user?.id) {
    return null;
  }

  return {
    externalUserId: user.id,
    username: user.username?.trim() || null,
    displayName: user.name?.trim() || user.username?.trim() || null,
  };
}

function mapTmsConversationState(state: PhraseTmsConversation["state"]): ProviderReviewThreadState {
  if (state === "resolved") {
    return "resolved";
  }
  if (state === "open") {
    return "open";
  }
  return "unknown";
}

function buildTmsConversationComments(
  conversation: PhraseTmsConversation,
): ProviderReviewComment[] {
  return conversation.comments.map((comment) => ({
    externalCommentId: comment.id,
    body: comment.text,
    author: mapPhraseTmsUser(comment.author),
    createdAt: comment.createdAt ?? null,
    updatedAt: comment.updatedAt ?? comment.createdAt ?? null,
  }));
}

function buildLqaIssueType(conversation: PhraseTmsConversation): string | null {
  const lqa = conversation.lqaReference;
  if (!lqa) {
    return null;
  }

  const parts: string[] = [];
  if (lqa.errorCategoryId != null) {
    parts.push(`category:${lqa.errorCategoryId}`);
  }
  if (lqa.severityId != null) {
    parts.push(`severity:${lqa.severityId}`);
  }
  if (lqa.repeated) {
    parts.push(`repeated:${lqa.repeated}`);
  }

  return parts.length > 0 ? parts.join(",") : null;
}

function pickConversationSubject(conversation: PhraseTmsConversation): string | null {
  if (conversation.description?.trim()) {
    return conversation.description.trim();
  }

  return conversation.comments[0]?.text ?? null;
}

function pickLatestTimestamp(conversation: PhraseTmsConversation): string | null {
  const timestamps = [
    conversation.updatedAt,
    conversation.resolvedAt,
    conversation.createdAt,
    ...conversation.comments.flatMap((comment) => [comment.updatedAt, comment.createdAt]),
  ].filter((value): value is string => Boolean(value?.trim()));

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort().at(-1) ?? null;
}

function buildTmsSegmentItemReference(input: {
  segmentId: string | null;
  targetLocale?: string | null;
}) {
  if (!input.segmentId) {
    return null;
  }

  return {
    externalStringId: input.segmentId,
    key: input.segmentId,
    locale: input.targetLocale ?? undefined,
    field: "target" as const,
  };
}

/** Normalizes a Phrase TMS LQA conversation into a provider review issue thread. */
export function normalizePhraseLqaConversationToThread(input: {
  conversation: PhraseTmsConversation;
  externalProjectId: string;
  externalJobId: string;
  jobProviderUrl: string | null;
  targetLocale?: string | null;
}): ProviderReviewThread | null {
  if (input.conversation.deleted || !input.conversation.id.trim()) {
    return null;
  }

  const externalThreadId = `tms-lqa:${input.conversation.id}`;
  const segmentId = input.conversation.lqaReference?.segmentId?.trim() || null;
  const comments = buildTmsConversationComments(input.conversation);
  const firstCommentId = comments[0]?.externalCommentId ?? input.conversation.id;

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "phrase",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "issue",
      externalThreadId,
    }),
    kind: "issue",
    state: mapTmsConversationState(input.conversation.state),
    subject: pickConversationSubject(input.conversation),
    issueType: buildLqaIssueType(input.conversation),
    item: buildTmsSegmentItemReference({
      segmentId,
      targetLocale: input.targetLocale,
    }),
    locale: input.targetLocale ?? null,
    comments,
    author: mapPhraseTmsUser(input.conversation.author),
    resolver: mapPhraseTmsUser(input.conversation.resolver),
    createdAt: input.conversation.createdAt ?? null,
    updatedAt: pickLatestTimestamp(input.conversation),
    resolvedAt: input.conversation.resolvedAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: firstCommentId,
      providerUrl: input.jobProviderUrl,
    },
  };
}

/** Normalizes a Phrase TMS plain conversation into a provider review comment thread. */
export function normalizePhrasePlainConversationToThread(input: {
  conversation: PhraseTmsConversation;
  externalProjectId: string;
  externalJobId: string;
  jobProviderUrl: string | null;
  targetLocale?: string | null;
}): ProviderReviewThread | null {
  if (input.conversation.deleted || !input.conversation.id.trim()) {
    return null;
  }

  const externalThreadId = `tms-plain:${input.conversation.id}`;
  const segmentId = input.conversation.lqaReference?.segmentId?.trim() || null;
  const comments = buildTmsConversationComments(input.conversation);
  const firstCommentId = comments[0]?.externalCommentId ?? input.conversation.id;

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "phrase",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "comment",
      externalThreadId,
    }),
    kind: "comment",
    state: mapTmsConversationState(input.conversation.state),
    subject: pickConversationSubject(input.conversation),
    item: buildTmsSegmentItemReference({
      segmentId,
      targetLocale: input.targetLocale,
    }),
    locale: segmentId ? (input.targetLocale ?? null) : null,
    comments,
    author: mapPhraseTmsUser(input.conversation.author),
    resolver: mapPhraseTmsUser(input.conversation.resolver),
    createdAt: input.conversation.createdAt ?? null,
    updatedAt: pickLatestTimestamp(input.conversation),
    resolvedAt: input.conversation.resolvedAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: firstCommentId,
      providerUrl: input.jobProviderUrl,
    },
  };
}

/** Normalizes a Phrase Strings key comment (and replies) into a provider review thread. */
export function normalizePhraseKeyCommentToThread(input: {
  comment: PhraseKeyComment;
  replies: PhraseKeyComment[];
  keyId: string;
  externalProjectId: string;
  externalJobId: string;
  stringKeyById: Map<string, string>;
  keyProviderUrl: string | null;
}): ProviderReviewThread | null {
  if (!input.comment.id.trim() || !input.comment.message.trim()) {
    return null;
  }

  const externalThreadId = `strings-key:${input.keyId}:${input.comment.id}`;
  const stringKey = input.stringKeyById.get(input.keyId) ?? input.keyId;
  const locale =
    input.comment.locales[0]?.code?.trim() || input.comment.locales[0]?.name?.trim() || null;

  const comments: ProviderReviewComment[] = [
    {
      externalCommentId: input.comment.id,
      body: input.comment.message,
      author: mapPhraseStringsUser(input.comment.user),
      createdAt: input.comment.createdAt ?? null,
      updatedAt: input.comment.updatedAt ?? input.comment.createdAt ?? null,
    },
    ...input.replies
      .filter((reply) => reply.id.trim() && reply.message.trim())
      .map((reply) => ({
        externalCommentId: reply.id,
        body: reply.message,
        author: mapPhraseStringsUser(reply.user),
        createdAt: reply.createdAt ?? null,
        updatedAt: reply.updatedAt ?? reply.createdAt ?? null,
      })),
  ];

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "phrase",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "comment",
      externalThreadId,
    }),
    kind: "comment",
    state: "unknown",
    subject: input.comment.message,
    item: {
      externalStringId: input.keyId,
      key: stringKey,
      locale: locale ?? undefined,
      field: "target",
    },
    locale,
    comments,
    author: mapPhraseStringsUser(input.comment.user),
    createdAt: input.comment.createdAt ?? null,
    updatedAt: input.comment.updatedAt ?? input.comment.createdAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: input.comment.id,
      providerUrl: input.keyProviderUrl,
    },
  };
}

/** One translation entry prepared for Phrase Strings upsert during write-back. */
export type PhraseTranslationWriteBackEntry = {
  key: string;
  keyId: string | null;
  locale: string;
  text: string;
  branch: string | null;
  jobTag: string | null;
};

/** Batch of write-back entries sharing locale and branch scope. */
export type PhraseTranslationWriteBackGroup = {
  locale: string;
  branch: string | null;
  jobTag: string | null;
  entries: PhraseTranslationWriteBackEntry[];
};

/** Validates and groups approved translation uploads for Phrase Strings upsert. */
export function buildPhraseTranslationWriteBackGroups(input: {
  translations: ExternalTmsApprovedTranslationUpload[];
  branch: string | null;
  jobTag: string | null;
  defaultTargetLocale: string | null;
}): {
  groups: PhraseTranslationWriteBackGroup[];
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
} {
  const groups = new Map<string, PhraseTranslationWriteBackGroup>();
  const failures: Array<{ locale: string; message: string; fileId?: string | null }> = [];

  for (const translation of input.translations) {
    const locale = translation.locale.trim() || input.defaultTargetLocale?.trim() || "";
    const key = translation.key?.trim() || translation.externalStringId?.trim() || "";
    const text = translation.text.trim();

    if (!locale) {
      failures.push({
        locale: translation.locale,
        fileId: translation.fileId ?? null,
        message: "phrase_translation_missing_locale",
      });
      continue;
    }

    if (!key) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "phrase_translation_missing_key",
      });
      continue;
    }

    if (!text) {
      failures.push({
        locale,
        fileId: translation.fileId ?? null,
        message: "phrase_translation_missing_text",
      });
      continue;
    }

    const groupKey = `${locale}::${input.branch ?? ""}`;
    const existing = groups.get(groupKey) ?? {
      locale,
      branch: input.branch,
      jobTag: input.jobTag,
      entries: [],
    };

    existing.entries.push({
      key,
      keyId: translation.externalStringId?.trim() || null,
      locale,
      text,
      branch: input.branch,
      jobTag: input.jobTag,
    });
    groups.set(groupKey, existing);
  }

  return {
    groups: [...groups.values()],
    failures,
  };
}

/** Typed error surfaced by live CAT operations when Phrase auth or input validation fails. */
export class PhraseLiveCatError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PhraseLiveCatError";
  }
}

type PhraseLiveCatContext = {
  token: string;
  region?: string | null;
  baseUrl?: string | null;
  stringsProjectId: string;
  branch: string | null;
};

type PhraseQueueSegmentDraft = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
};

function buildQueueSegmentFromKey(key: PhraseKey): PhraseQueueSegmentDraft {
  return {
    externalStringId: key.id,
    key: key.name,
    sourceText: key.name,
    context: key.description,
    type: key.dataType,
  };
}

function draftToQueueSegment(draft: PhraseQueueSegmentDraft): ProjectFileCatQueueSegment {
  return {
    externalStringId: draft.externalStringId,
    key: draft.key,
    sourceText: draft.sourceText,
    context: draft.context,
    type: draft.type,
  };
}

function mapPhraseApiError(error: unknown): never {
  if (error instanceof PhraseApiError && error.status === 401) {
    throw new PhraseLiveCatError("phrase_auth_invalid", "Phrase credentials are invalid.");
  }
  throw error;
}

function readFileMetadata(file: TmsProviderLiveFile) {
  const payload = file.metadata ?? {};
  const branch =
    typeof payload.branch === "string" && payload.branch.trim() ? payload.branch.trim() : null;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];

  return { branch, tags };
}

function resolvePhraseLiveCatContext(input: {
  file: TmsProviderLiveFile;
  externalProjectId: string;
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
}): PhraseLiveCatContext {
  const stringsProjectId = resolvePhraseStringsProjectId(
    { providerMetadata: {} },
    input.externalProjectId,
  );
  if (!stringsProjectId) {
    throw new PhraseLiveCatError(
      "invalid_phrase_project_id",
      "Phrase project identifier is invalid.",
    );
  }

  const metadata = readFileMetadata(input.file);
  const parsedResource = parsePhraseExternalResourceId(
    input.file.provider?.externalResourceId ?? "",
  );

  return {
    token: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
    stringsProjectId,
    branch:
      metadata.branch ?? parsedResource.branch ?? resolvePhraseBranch({ providerMetadata: {} }),
  };
}

function phraseTranslationIsApproved(translation: PhraseTranslation | null | undefined) {
  if (!translation) {
    return false;
  }

  return (
    mapPhraseTranslationReadiness({
      content: translation.content,
      state: translation.state,
      unverified: translation.unverified,
      excluded: translation.excluded,
    }) === "ready"
  );
}

function mapPhraseTargetTranslation(
  translation: PhraseTranslation | null | undefined,
): ProjectFileCatTranslation | null {
  if (!translation?.content?.trim()) {
    return null;
  }

  return {
    text: translation.content,
    externalTranslationId: translation.id,
    isApproved: phraseTranslationIsApproved(translation),
  };
}

function resolvePhraseTargetLocale(targetLocale: string, locales: PhraseLocale[]): PhraseLocale {
  const matched = matchPhraseTargetLocale(targetLocale, locales);
  if (!matched) {
    throw new PhraseLiveCatError(
      "phrase_target_locale_not_found",
      `Target locale "${targetLocale}" was not found in the Phrase project.`,
    );
  }

  return matched;
}

function mapPhraseKeyComment(
  comment: {
    id: string;
    message: string;
    createdAt: string | null;
    updatedAt: string | null;
    user: { username: string | null; name: string | null } | null;
    locales: Array<{ name: string; code: string | null }>;
  },
  targetLocale: string,
): ProjectFileCatComment {
  const locale =
    comment.locales[0]?.code?.trim() || comment.locales[0]?.name?.trim() || targetLocale || null;

  return {
    externalCommentId: comment.id,
    type: "comment",
    status: null,
    text: comment.message,
    createdAt: comment.createdAt ?? comment.updatedAt ?? null,
    locale,
    author: comment.user?.name ?? comment.user?.username ?? null,
  };
}

function segmentMatchesSearch(segment: PhraseQueueSegmentDraft, search: string | undefined) {
  const query = search?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return (
    segment.key.toLowerCase().includes(query) || segment.sourceText.toLowerCase().includes(query)
  );
}

async function loadTranslationsByKeyId(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  projectId: string;
  localeNames: Set<string>;
  branch: string | null;
  keyIds: string[];
}) {
  const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
  const listOptions = input.branch ? { branch: input.branch } : {};
  if (input.keyIds.length === 0) {
    return translationsByKeyId;
  }

  await mapWithConcurrency(
    input.keyIds,
    PHRASE_LIVE_CAT_LOCALE_FETCH_CONCURRENCY,
    async (keyId) => {
      try {
        const translations = await input.client.listKeyTranslations(
          input.projectId,
          keyId,
          listOptions,
        );

        for (const translation of translations) {
          if (!translation.localeName || !input.localeNames.has(translation.localeName)) {
            continue;
          }

          const byLocale = translationsByKeyId.get(keyId) ?? new Map<string, PhraseTranslation>();
          byLocale.set(translation.localeName, translation);
          translationsByKeyId.set(keyId, byLocale);
        }
      } catch (error) {
        mapPhraseApiError(error);
      }
    },
  );

  return translationsByKeyId;
}

function filterKeysByFileTags(keys: PhraseKey[], tags: string[]) {
  if (tags.length === 0) {
    return keys;
  }

  return keys.filter((key) => key.tags.some((tag) => tags.includes(tag)));
}

async function loadPhraseQueuePage(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  scope: PhraseLiveCatContext;
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
  const parsedResource = parsePhraseExternalResourceId(
    input.file.provider?.externalResourceId ?? "",
  );
  const listOptions = input.scope.branch ? { branch: input.scope.branch } : {};
  const { offset, limit, search, queueFilter } = input.paginationInput;
  if (queueFilter === "has_issues") {
    throw new PhraseLiveCatError(
      "phrase_cat_queue_filter_unsupported",
      "Phrase does not support filtering the CAT queue by issues.",
    );
  }

  if (resourceType === "key") {
    const key =
      (await input.client.getKey(
        input.scope.stringsProjectId,
        parsedResource.resourceId,
        listOptions,
      )) ?? null;
    const keys = key ? [key] : [];
    const segments = keys
      .map(buildQueueSegmentFromKey)
      .filter((segment) => segmentMatchesSearch(segment, search))
      .slice(offset, offset + limit)
      .map(draftToQueueSegment);

    return {
      segments,
      hasMore: false,
    };
  }

  const needsClientSideFilter = Boolean(search?.trim()) || metadata.tags.length > 0;

  if (!needsClientSideFilter) {
    const phrasePage = Math.floor(offset / limit) + 1;
    const { keys, hasMore } = await input.client.listKeysPage(input.scope.stringsProjectId, {
      ...listOptions,
      page: phrasePage,
      perPage: limit,
    });

    return {
      segments: keys.map(buildQueueSegmentFromKey).map(draftToQueueSegment),
      hasMore,
    };
  }

  const collected: ProjectFileCatQueueSegment[] = [];
  const resumingScan = input.paginationInput.phraseScanPage != null;
  let phrasePage = resumingScan ? input.paginationInput.phraseScanPage! : 1;
  let skipMatches = resumingScan ? (input.paginationInput.phraseScanSkip ?? 0) : offset;
  let scanComplete = false;
  let nextPhraseScanPage: number | undefined;
  let nextPhraseScanSkip: number | undefined;
  const scanPageBudget = resumingScan
    ? phrasePage + PHRASE_MAX_SCAN_PAGES - 1
    : Math.max(
        PHRASE_MAX_SCAN_PAGES,
        Math.ceil((offset + limit) / PHRASE_QUEUE_SCAN_PAGE_SIZE) + PHRASE_MAX_SCAN_PAGES,
      );

  while (collected.length < limit && phrasePage <= scanPageBudget) {
    const { keys: rawKeys, hasMore } = await input.client.listKeysPage(
      input.scope.stringsProjectId,
      {
        ...listOptions,
        page: phrasePage,
        perPage: PHRASE_QUEUE_SCAN_PAGE_SIZE,
      },
    );
    const keys = filterKeysByFileTags(rawKeys, metadata.tags);

    if (keys.length > 0) {
      const drafts = keys.map(buildQueueSegmentFromKey);

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
          nextPhraseScanPage = phrasePage;
          nextPhraseScanSkip = matchesSeenOnPage;
          break;
        }
      }
    }

    if (collected.length >= limit) {
      break;
    }

    if (!hasMore) {
      scanComplete = true;
      break;
    }

    phrasePage += 1;
    skipMatches = 0;
  }

  return {
    segments: collected,
    hasMore: collected.length >= limit && !scanComplete,
    nextPhraseScanPage,
    nextPhraseScanSkip,
  };
}

/** Builds a paginated live CAT queue file for Phrase Strings file or key resources. */
export async function buildPhraseLiveCatFile(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  canEditTranslations: boolean;
  pagination?: ProjectFileCatPaginationInput;
}): Promise<ProjectFileCatQueueFile> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  resolvePhraseTargetLocale(input.targetLocale, locales);

  const paginationInput = input.pagination ?? {
    offset: 0,
    limit: legacyProviderCatSegmentLimit,
    search: undefined,
    queueFilter: "all",
    paginated: true,
  };

  const { segments, hasMore, nextPhraseScanPage, nextPhraseScanSkip } = await loadPhraseQueuePage({
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

/** Loads the current target translation for one Phrase CAT segment, or `"not_found"`. */
export async function getPhraseLiveCatSegmentTarget(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatTranslation | null | "not_found"> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  const targetLocale = resolvePhraseTargetLocale(input.targetLocale, locales);

  let translationsByKeyId: Map<string, Map<string, PhraseTranslation>>;
  try {
    translationsByKeyId = await loadTranslationsByKeyId({
      client,
      projectId: scope.stringsProjectId,
      localeNames: new Set([targetLocale.name]),
      branch: scope.branch,
      keyIds: [input.externalStringId],
    });
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return "not_found";
    }
    mapPhraseApiError(error);
  }

  if (!translationsByKeyId.has(input.externalStringId)) {
    return "not_found";
  }

  const targetTranslation = translationsByKeyId.get(input.externalStringId)?.get(targetLocale.name);

  return mapPhraseTargetTranslation(targetTranslation);
}

/** Lists key comments for one Phrase CAT segment. */
export async function getPhraseLiveCatSegmentComments(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
}): Promise<ProjectFileCatComment[]> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let key: PhraseKey | null;
  try {
    key = await client.getKey(scope.stringsProjectId, input.externalStringId, listOptions);
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return [];
    }
    mapPhraseApiError(error);
  }

  if (!key) {
    return [];
  }

  try {
    const remoteComments = await client.listKeyComments(
      scope.stringsProjectId,
      key.id,
      listOptions,
    );
    return remoteComments.map((comment) => mapPhraseKeyComment(comment, input.targetLocale));
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 404) {
      return [];
    }
    mapPhraseApiError(error);
  }
}

/** Saves an approved target translation for one Phrase CAT segment. */
export async function savePhraseLiveCatTranslation(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatTranslation> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  const targetLocale = resolvePhraseTargetLocale(input.targetLocale, locales);

  let saved: PhraseTranslation;
  try {
    saved = await client.upsertTranslation(scope.stringsProjectId, {
      keyId: input.externalStringId,
      localeName: targetLocale.name,
      content: input.text,
      branch: scope.branch,
      unverified: false,
    });
  } catch (error) {
    mapPhraseApiError(error);
  }

  return {
    text: saved.content?.trim() || input.text,
    externalTranslationId: saved.id,
    isApproved: phraseTranslationIsApproved(saved),
  };
}

/** Creates a key comment from the Phrase live CAT editor. */
export async function savePhraseLiveCatComment(input: {
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
  externalProjectId: string;
  file: TmsProviderLiveFile;
  targetLocale: string;
  externalStringId: string;
  text: string;
}): Promise<ProjectFileCatComment> {
  const scope = resolvePhraseLiveCatContext({
    file: input.file,
    externalProjectId: input.externalProjectId,
    secretMaterial: input.secretMaterial,
    region: input.region,
    baseUrl: input.baseUrl,
  });
  const client = createPhraseStringsApiClient({
    token: scope.token,
    region: scope.region,
    baseUrl: scope.baseUrl,
  });
  const listOptions = scope.branch ? { branch: scope.branch } : {};

  let locales: PhraseLocale[];
  try {
    locales = await client.listLocales(scope.stringsProjectId, listOptions);
  } catch (error) {
    mapPhraseApiError(error);
  }

  const resolvedLocale = resolvePhraseTargetLocale(input.targetLocale, locales);

  let created: Awaited<ReturnType<typeof client.createKeyComment>>;
  try {
    created = await client.createKeyComment(
      scope.stringsProjectId,
      input.externalStringId,
      {
        message: input.text,
        localeName: resolvedLocale.name,
      },
      listOptions,
    );
  } catch (error) {
    mapPhraseApiError(error);
  }

  return mapPhraseKeyComment(created, input.targetLocale);
}

/** Shared Phrase TMS provider instance registered in the provider registry. */
export const phraseTmsProvider = new PhraseTmsProvider();
