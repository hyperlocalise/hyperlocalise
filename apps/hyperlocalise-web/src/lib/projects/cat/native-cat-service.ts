import { and, eq } from "drizzle-orm";

import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatSegment,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { legacyNativeCatSegmentLimit } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import { NativeCatCommentService } from "@/lib/projects/cat/native-cat-comment-service";
import {
  buildCatFilePagination,
  type ProjectFileCatPaginationInput,
} from "@/lib/projects/cat/project-file-cat-pagination";
import { getImageVariant, projectImageAssetPath } from "@/lib/projects/files/image-variant-service";
import {
  IMAGE_URL_CONTENT_KIND,
  isImageUrlContentKind,
} from "@/lib/projects/files/image-url-translation-service";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";
import {
  inferSupportedImageTranslationFileFormat,
  looksLikeImageUrl,
} from "@/lib/translation/file-formats";

function filenameFromSourcePath(sourcePath: string) {
  return sourcePath.split("/").at(-1) ?? sourcePath;
}

function imageFileExternalStringId(sourceFileId: string, sourcePath: string) {
  return sourceFileId || `image:${sourcePath}`;
}

function toCatTranslation(row: {
  id: string;
  text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
  contentKind?: ProjectFileCatTranslation["contentKind"];
  targetAssetUrl?: string | null;
  imageVariantId?: string | null;
}): ProjectFileCatTranslation {
  return {
    text: row.text,
    externalTranslationId: row.id,
    isApproved: row.status === "approved",
    ...(row.contentKind ? { contentKind: row.contentKind } : {}),
    ...(row.targetAssetUrl !== undefined ? { targetAssetUrl: row.targetAssetUrl } : {}),
    ...(row.imageVariantId !== undefined ? { imageVariantId: row.imageVariantId } : {}),
    status: row.status,
  };
}

function mapTextSegment(key: {
  id: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
  maxLength: number | null;
  metadata: Record<string, unknown> | null;
}): ProjectFileCatSegment {
  const contentKind = isImageUrlContentKind(key.metadata) ? IMAGE_URL_CONTENT_KIND : undefined;
  const looksLikeUrl = looksLikeImageUrl(key.sourceText);

  return {
    externalStringId: key.id,
    key: key.key,
    sourceText: key.sourceText,
    context: key.context,
    type: key.type,
    ...(key.maxLength != null && key.maxLength > 0 ? { maxLength: key.maxLength } : {}),
    ...(contentKind ? { contentKind } : {}),
    ...(contentKind === IMAGE_URL_CONTENT_KIND ? { sourceAssetUrl: key.sourceText } : {}),
    ...(looksLikeUrl || contentKind === IMAGE_URL_CONTENT_KIND
      ? { looksLikeImageUrl: looksLikeUrl || contentKind === IMAGE_URL_CONTENT_KIND }
      : {}),
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
    organizationSlug: string;
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

    if (inferSupportedImageTranslationFileFormat(input.sourcePath)) {
      return this.buildImageCatFileResponse({
        input,
        sourceFileId: sourceFile.id,
      });
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

  private async buildImageCatFileResponse(input: {
    input: {
      organizationId: string;
      projectId: string;
      sourcePath: string;
      targetLocale: string;
      canEditTranslations: boolean;
      organizationSlug: string;
    };
    sourceFileId: string;
  }): Promise<ProjectFileCatQueueFile> {
    const [latestVersion, variant] = await Promise.all([
      getLatestRepositorySourceFileVersion({
        organizationId: input.input.organizationId,
        projectId: input.input.projectId,
        sourcePath: input.input.sourcePath,
        db: this.database,
      }),
      getImageVariant({
        organizationId: input.input.organizationId,
        projectId: input.input.projectId,
        sourcePath: input.input.sourcePath,
        targetLocale: input.input.targetLocale,
        db: this.database,
      }),
    ]);

    const sourceStoredFileId = latestVersion?.storedFileId ?? null;
    const targetStoredFileId = variant?.storedFileId ?? null;
    const sourceAssetUrl = sourceStoredFileId
      ? projectImageAssetPath({
          organizationSlug: input.input.organizationSlug,
          projectId: input.input.projectId,
          fileId: sourceStoredFileId,
        })
      : null;
    const targetAssetUrl = targetStoredFileId
      ? projectImageAssetPath({
          organizationSlug: input.input.organizationSlug,
          projectId: input.input.projectId,
          fileId: targetStoredFileId,
        })
      : null;

    return {
      sourcePath: input.input.sourcePath,
      filename: filenameFromSourcePath(input.input.sourcePath),
      provider: null,
      targetLocale: input.input.targetLocale,
      canEditTranslations: input.input.canEditTranslations,
      truncated: false,
      segments: [
        {
          externalStringId: imageFileExternalStringId(input.sourceFileId, input.input.sourcePath),
          key: input.input.sourcePath,
          sourceText: input.input.sourcePath,
          context: null,
          type: null,
          contentKind: "image_file",
          sourceAssetUrl,
          targetAssetUrl,
          imageVariantId: variant?.id ?? null,
        },
      ],
    };
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
      segments: input.visibleKeys.map((key) => mapTextSegment(key)),
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
    organizationSlug: string;
  }): Promise<ProjectFileCatTranslation | null | "not_found"> {
    const sourceFile = await this.translations.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return "not_found";
    }

    if (inferSupportedImageTranslationFileFormat(input.sourcePath)) {
      const expectedId = imageFileExternalStringId(sourceFile.id, input.sourcePath);
      if (
        input.externalStringId !== expectedId &&
        input.externalStringId !== sourceFile.id &&
        input.externalStringId !== `image:${input.sourcePath}`
      ) {
        return "not_found";
      }

      const variant = await getImageVariant({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        db: this.database,
      });

      const targetAssetUrl = variant?.storedFileId
        ? projectImageAssetPath({
            organizationSlug: input.organizationSlug,
            projectId: input.projectId,
            fileId: variant.storedFileId,
          })
        : null;

      if (!variant) {
        return {
          text: "",
          externalTranslationId: null,
          isApproved: false,
          contentKind: "image_file",
          targetAssetUrl: null,
          imageVariantId: null,
          status: "draft",
        };
      }

      return toCatTranslation({
        id: variant.id,
        text: targetAssetUrl ?? "",
        status: variant.status,
        contentKind: "image_file",
        targetAssetUrl,
        imageVariantId: variant.id,
      });
    }

    const [key] = await this.database
      .select({
        id: schema.projectTranslationKeys.id,
        metadata: schema.projectTranslationKeys.metadata,
      })
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

    if (!translation) {
      return null;
    }

    const contentKind = isImageUrlContentKind(key.metadata) ? IMAGE_URL_CONTENT_KIND : undefined;

    return toCatTranslation({
      ...translation,
      ...(contentKind
        ? {
            contentKind,
            targetAssetUrl: translation.text,
          }
        : {}),
    });
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

    if (inferSupportedImageTranslationFileFormat(input.sourcePath)) {
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
