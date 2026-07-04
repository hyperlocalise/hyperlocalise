import { and, eq } from "drizzle-orm";

import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { legacyNativeCatSegmentLimit } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import { NativeCatCommentService } from "@/lib/projects/cat/native-cat-comment-service";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
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
  private readonly comments: NativeCatCommentService;

  constructor(
    database: typeof db = db,
    translations: ProjectTranslationService = new ProjectTranslationService(database),
    comments?: NativeCatCommentService,
  ) {
    super(database, "projects.cat");
    this.translations = translations;
    this.comments = comments ?? new NativeCatCommentService(database, translations);
  }

  async getCatFile(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    canEditTranslations: boolean;
    pagination?: ProjectFileCatPaginationInput;
  }): Promise<ProjectFileCatQueueFile | null> {
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

      return this.buildCatFileResponse({
        input,
        visibleKeys,
        truncated,
        pagination: undefined,
      });
    }

    const [totalCount, keys] = await Promise.all([
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
  }): Promise<ProjectFileCatQueueFile> {
    return {
      sourcePath: input.input.sourcePath,
      filename: filenameFromSourcePath(input.input.sourcePath),
      provider: null,
      targetLocale: input.input.targetLocale,
      canEditTranslations: input.input.canEditTranslations,
      truncated: input.truncated,
      pagination: input.pagination,
      segments: input.visibleKeys.map((key) => ({
        externalStringId: key.id,
        key: key.key,
        sourceText: key.sourceText,
        context: key.context,
        type: key.type,
        ...(key.maxLength != null && key.maxLength > 0 ? { maxLength: key.maxLength } : {}),
      })),
    };
  }

  async saveComment(input: Parameters<NativeCatCommentService["save"]>[0]) {
    return this.comments.save(input);
  }

  async resolveComment(input: Parameters<NativeCatCommentService["resolve"]>[0]) {
    return this.comments.resolve(input);
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

  async getSegmentTarget(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalStringId: string;
  }): Promise<ProjectFileCatTranslation | null | "not_found"> {
    const sourceFile = await this.translations.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return "not_found";
    }

    const [key] = await this.database
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.id, input.externalStringId),
          eq(schema.projectTranslationKeys.organizationId, input.organizationId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        ),
      )
      .limit(1);

    if (!key) {
      return "not_found";
    }

    const translation = (
      await this.translations.getTranslationsByKeyIds({
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyIds: [key.id],
        targetLocale: input.targetLocale,
      })
    )[0];

    return translation ? toCatTranslation(translation) : null;
  }

  async getSegmentComments(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalStringId: string;
  }): Promise<ProjectFileCatComment[]> {
    const sourceFile = await this.translations.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return [];
    }

    const [key] = await this.database
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.id, input.externalStringId),
          eq(schema.projectTranslationKeys.organizationId, input.organizationId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        ),
      )
      .limit(1);

    if (!key) {
      return [];
    }

    const commentsByKeyId = await this.comments.listByKeyIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyIds: [key.id],
      targetLocale: input.targetLocale,
    });

    return commentsByKeyId.get(key.id) ?? [];
  }
}

export const nativeCatService = new NativeCatService();

export const getNativeProjectCatFile = (input: Parameters<NativeCatService["getCatFile"]>[0]) =>
  nativeCatService.getCatFile(input);

export const getNativeProjectCatSegmentTarget = (
  input: Parameters<NativeCatService["getSegmentTarget"]>[0],
) => nativeCatService.getSegmentTarget(input);

export const getNativeProjectCatSegmentComments = (
  input: Parameters<NativeCatService["getSegmentComments"]>[0],
) => nativeCatService.getSegmentComments(input);

export const saveNativeProjectCatTranslation = (
  input: Parameters<NativeCatService["saveTranslation"]>[0],
) => nativeCatService.saveTranslation(input);

export const saveNativeProjectCatComment = (
  input: Parameters<NativeCatService["saveComment"]>[0],
) => nativeCatService.saveComment(input);

export const resolveNativeProjectCatComment = (
  input: Parameters<NativeCatService["resolveComment"]>[0],
) => nativeCatService.resolveComment(input);

export const updateNativeProjectTranslationStatus = (
  input: Parameters<NativeCatService["updateTranslationStatus"]>[0],
) => nativeCatService.updateTranslationStatus(input);
