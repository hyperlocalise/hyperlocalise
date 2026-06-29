import { and, eq } from "drizzle-orm";

import type {
  ProjectFileCatResponse,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { legacyNativeCatSegmentLimit } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import { countNativeFileQueueSummary } from "@/lib/projects/cat/project-file-cat-queue-summary";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import { ProjectStringContextService } from "@/lib/projects/string-context/project-string-context-service";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

function filenameFromSourcePath(sourcePath: string) {
  return sourcePath.split("/").at(-1) ?? sourcePath;
}

function toCatTranslation(row: {
  id: string;
  text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
}): ProjectFileCatTranslation {
  return {
    text: row.text,
    externalTranslationId: row.id,
    isApproved: row.status === "approved",
  };
}

export class NativeCatService extends ProjectServiceBase {
  private readonly translations: ProjectTranslationService;
  private readonly stringContext: ProjectStringContextService;

  constructor(
    database: typeof db = db,
    translations: ProjectTranslationService = new ProjectTranslationService(database),
    stringContext: ProjectStringContextService = new ProjectStringContextService(database),
  ) {
    super(database, "projects.cat");
    this.translations = translations;
    this.stringContext = stringContext;
  }

  async getCatFile(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    canEditTranslations: boolean;
    pagination?: ProjectFileCatPaginationInput;
  }): Promise<ProjectFileCatResponse["catFile"] | null> {
    const sourceFile = await this.translations.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return null;
    }

    const paginationInput = input.pagination ?? {
      offset: 0,
      limit: legacyNativeCatSegmentLimit,
      search: undefined,
      queueFilter: "all",
      paginated: false,
    };

    if (!paginationInput.paginated) {
      const keys = await this.translations.listKeysForFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.id,
        limit: legacyNativeCatSegmentLimit + 1,
      });

      const truncated = keys.length > legacyNativeCatSegmentLimit;
      const visibleKeys = truncated ? keys.slice(0, legacyNativeCatSegmentLimit) : keys;
      const queueSummary = await countNativeFileQueueSummary(this.translations, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.id,
        targetLocale: input.targetLocale,
      });

      return this.buildCatFileResponse({
        input,
        visibleKeys,
        truncated,
        pagination: undefined,
        queueSummary,
      });
    }

    const [totalCount, keys, queueSummary] = await Promise.all([
      this.translations.countKeysForFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.id,
        targetLocale: input.targetLocale,
        search: paginationInput.search,
        queueFilter: paginationInput.queueFilter,
      }),
      this.translations.listKeysForFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.id,
        targetLocale: input.targetLocale,
        limit: paginationInput.limit,
        offset: paginationInput.offset,
        search: paginationInput.search,
        queueFilter: paginationInput.queueFilter,
      }),
      countNativeFileQueueSummary(this.translations, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.id,
        targetLocale: input.targetLocale,
      }),
    ]);

    const pagination = buildCatFilePagination({
      offset: paginationInput.offset,
      limit: paginationInput.limit,
      returnedCount: keys.length,
      totalCount,
    });

    return this.buildCatFileResponse({
      input,
      visibleKeys: keys,
      truncated: pagination.hasMore,
      pagination,
      queueSummary,
    });
  }

  private async buildCatFileResponse(input: {
    input: {
      sourcePath: string;
      targetLocale: string;
      canEditTranslations: boolean;
      organizationId: string;
      projectId: string;
    };
    visibleKeys: Awaited<ReturnType<ProjectTranslationService["listKeysForFile"]>>;
    truncated: boolean;
    pagination: ReturnType<typeof buildCatFilePagination> | undefined;
    queueSummary: Awaited<ReturnType<typeof countNativeFileQueueSummary>>;
  }): Promise<ProjectFileCatResponse["catFile"]> {
    const translations = await this.translations.getTranslationsByKeyIds({
      organizationId: input.input.organizationId,
      projectId: input.input.projectId,
      translationKeyIds: input.visibleKeys.map((key) => key.id),
      targetLocale: input.input.targetLocale,
    });
    const translationByKeyId = new Map(
      translations.map((translation) => [translation.translationKeyId, translation]),
    );

    return {
      sourcePath: input.input.sourcePath,
      filename: filenameFromSourcePath(input.input.sourcePath),
      provider: null,
      targetLocale: input.input.targetLocale,
      canEditTranslations: input.input.canEditTranslations,
      truncated: input.truncated,
      pagination: input.pagination,
      queueSummary: input.queueSummary,
      segments: input.visibleKeys.map((key) => {
        const translation = translationByKeyId.get(key.id);
        return {
          externalStringId: key.id,
          key: key.key,
          sourceText: key.sourceText,
          context: key.context,
          type: key.type,
          ...(key.maxLength != null ? { maxLength: key.maxLength } : {}),
          target: translation ? toCatTranslation(translation) : null,
          comments: [],
        };
      }),
    };
  }

  async saveTranslation(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    translationKeyId: string;
    text: string;
    approve?: boolean;
    actorUserId?: string;
    provenance?: "manual" | "translation_job" | "import" | "agent";
    sourceJobId?: string;
  }): Promise<ProjectFileCatTranslation | null> {
    const sourceFile = await this.translations.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return null;
    }

    const [key] = await this.database
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.id, input.translationKeyId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        ),
      )
      .limit(1);

    if (!key) {
      return null;
    }

    const status = input.approve ? "approved" : "draft";
    const provenance = input.provenance ?? "manual";
    const reviewedAt = input.approve ? new Date() : null;
    const reviewedByUserId = input.approve ? (input.actorUserId ?? null) : null;

    const [saved] = await this.database
      .insert(schema.projectTranslations)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: key.id,
        targetLocale: input.targetLocale,
        text: input.text,
        status,
        provenance,
        sourceJobId: input.sourceJobId ?? null,
        reviewedByUserId,
        reviewedAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.projectTranslations.translationKeyId,
          schema.projectTranslations.targetLocale,
        ],
        set: {
          text: input.text,
          status,
          provenance,
          sourceJobId: input.sourceJobId ?? null,
          reviewedByUserId,
          reviewedAt,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: schema.projectTranslations.id,
        text: schema.projectTranslations.text,
        status: schema.projectTranslations.status,
      });

    if (!saved) {
      return null;
    }

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: input.translationKeyId,
        status,
      },
      "saved native CAT translation",
    );

    return toCatTranslation(saved);
  }

  async updateTranslationStatus(input: {
    organizationId: string;
    projectId: string;
    translationKeyId: string;
    targetLocale: string;
    status: "needs_review" | "approved" | "rejected";
    actorUserId?: string;
  }) {
    const reviewedAt =
      input.status === "approved" || input.status === "rejected" ? new Date() : null;
    const reviewedByUserId =
      input.status === "approved" || input.status === "rejected"
        ? (input.actorUserId ?? null)
        : null;

    const [updated] = await this.database
      .update(schema.projectTranslations)
      .set({
        status: input.status,
        reviewedAt,
        reviewedByUserId,
      })
      .where(
        and(
          eq(schema.projectTranslations.organizationId, input.organizationId),
          eq(schema.projectTranslations.projectId, input.projectId),
          eq(schema.projectTranslations.translationKeyId, input.translationKeyId),
          eq(schema.projectTranslations.targetLocale, input.targetLocale),
        ),
      )
      .returning({
        id: schema.projectTranslations.id,
        text: schema.projectTranslations.text,
        status: schema.projectTranslations.status,
      });

    if (updated) {
      this.log.debug(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          translationKeyId: input.translationKeyId,
          status: input.status,
        },
        "updated native CAT translation status",
      );
    }

    return updated ? toCatTranslation(updated) : null;
  }

  async attachAgentContexts(input: {
    organizationId: string;
    projectId: string;
    catFile: ProjectFileCatResponse["catFile"];
    preferredRepositoryFullName?: string | null;
  }): Promise<ProjectFileCatResponse["catFile"]> {
    const log = this.log.child({
      organizationId: input.organizationId,
      projectId: input.projectId,
      segmentCount: input.catFile.segments.length,
    });

    if (input.catFile.segments.length === 0) {
      log.debug("skipping CAT context hydration for empty segment list");
      return input.catFile;
    }

    log.debug("hydrating CAT file with cached repository context");

    const sourceTextByKey = new Map(
      input.catFile.segments.map((segment) => [segment.key, segment.sourceText] as const),
    );
    const cachedSummaries = await this.stringContext.listCached({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.catFile.sourcePath,
      stringKeys: input.catFile.segments.map((segment) => segment.key),
      preferredRepositoryFullName: input.preferredRepositoryFullName,
      sourceTextByKey,
    });

    if (cachedSummaries.size === 0) {
      log.debug("no cached repository context matched CAT segments");
      return input.catFile;
    }

    const hydratedSegments = input.catFile.segments.map((segment) => {
      const repositoryContext = cachedSummaries.get(segment.key);
      if (!repositoryContext) {
        return segment;
      }

      return {
        ...segment,
        repositoryContext,
      };
    });
    const hydratedSegmentCount = hydratedSegments.filter((segment) =>
      Boolean(segment.repositoryContext?.trim()),
    ).length;

    log.debug(
      {
        cachedKeyCount: cachedSummaries.size,
        hydratedSegmentCount,
      },
      "hydrated CAT file with cached repository context",
    );

    return {
      ...input.catFile,
      segments: hydratedSegments,
    };
  }
}

export const nativeCatService = new NativeCatService();

export const getNativeProjectCatFile = (input: Parameters<NativeCatService["getCatFile"]>[0]) =>
  nativeCatService.getCatFile(input);

export const saveNativeProjectCatTranslation = (
  input: Parameters<NativeCatService["saveTranslation"]>[0],
) => nativeCatService.saveTranslation(input);

export const updateNativeProjectTranslationStatus = (
  input: Parameters<NativeCatService["updateTranslationStatus"]>[0],
) => nativeCatService.updateTranslationStatus(input);

export const attachProjectFileCatAgentContexts = (
  input: Parameters<NativeCatService["attachAgentContexts"]>[0],
) => nativeCatService.attachAgentContexts(input);
