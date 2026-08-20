/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq } from "drizzle-orm";

import {
  VideoLocalizationError,
  regenerateVideoFromAttachment,
} from "@/lib/agents/video-generation";
import {
  buildVideoLocalizationPrompt,
  localizedVideoOutputFilename,
} from "@/lib/agents/video-localization";
import { db, schema } from "@/lib/database";
import { createStoredFile } from "@/lib/file-storage/records";
import { publicMediaAssetUrl, publicMediaMetadata } from "@/lib/projects/files/public-media";
import {
  fetchVideoBytesFromUrl,
  type VideoVariantError,
} from "@/lib/projects/files/video-variant-service";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { assertMp4DurationSupported } from "@/lib/translation/mp4-duration";

export const VIDEO_URL_CONTENT_KIND = "video_url" as const;

export type VideoUrlContentKindError =
  | { code: "key_not_found" }
  | { code: "video_fetch_failed"; message: string }
  | { code: "video_ssrf_blocked" }
  | { code: "unsupported_video_format" }
  | { code: "video_duration_unreadable" }
  | { code: "video_duration_unsupported" }
  | { code: "video_model_unavailable" }
  | { code: "video_edit_region_blocked" }
  | { code: "video_localization_failed"; message: string }
  | { code: "approved_locked" };

export function isVideoUrlContentKind(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.contentKind === VIDEO_URL_CONTENT_KIND;
}

function contentKindMetadata(
  metadata: Record<string, unknown>,
  contentKind: typeof VIDEO_URL_CONTENT_KIND | null,
) {
  const next = { ...metadata };
  if (contentKind) {
    next.contentKind = contentKind;
  } else if (next.contentKind === VIDEO_URL_CONTENT_KIND) {
    delete next.contentKind;
  }
  return next;
}

function mapFetchError(error: VideoVariantError): VideoUrlContentKindError {
  if (
    error.code === "video_fetch_failed" ||
    error.code === "video_ssrf_blocked" ||
    error.code === "unsupported_video_format"
  ) {
    return error;
  }
  return { code: "video_fetch_failed", message: "video fetch failed" };
}

export async function setTranslationKeyTreatAsVideo(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  treatAsVideo: boolean;
}): Promise<Result<typeof schema.projectTranslationKeys.$inferSelect, VideoUrlContentKindError>> {
  const [key] = await db
    .select()
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.id, input.translationKeyId),
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
      ),
    )
    .limit(1);

  if (!key) {
    return err({ code: "key_not_found" });
  }

  const [updated] = await db
    .update(schema.projectTranslationKeys)
    .set({
      metadata: contentKindMetadata(
        key.metadata,
        input.treatAsVideo ? VIDEO_URL_CONTENT_KIND : null,
      ),
      updatedAt: new Date(),
    })
    .where(eq(schema.projectTranslationKeys.id, key.id))
    .returning();

  if (!updated) {
    return err({ code: "key_not_found" });
  }

  return ok(updated);
}

function mapGenerationError(error: unknown): VideoUrlContentKindError {
  if (error instanceof VideoLocalizationError) {
    if (error.code === "video_localization_failed") {
      return { code: "video_localization_failed", message: error.message };
    }
    return { code: error.code };
  }
  return {
    code: "video_localization_failed",
    message: error instanceof Error ? error.message : "video localization failed",
  };
}

export async function localizeVideoUrlTranslation(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  sourceLocale?: string | null;
  origin?: string | null;
  instructions?: string | null;
  actorUserId?: string | null;
  force?: boolean;
}): Promise<
  Result<
    {
      translation: typeof schema.projectTranslations.$inferSelect;
      assetUrl: string;
      storedFileId: string;
    },
    VideoUrlContentKindError
  >
> {
  const [key] = await db
    .select()
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.id, input.translationKeyId),
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
      ),
    )
    .limit(1);

  if (!key) {
    return err({ code: "key_not_found" });
  }

  const [existingTranslation] = await db
    .select()
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.translationKeyId, key.id),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
      ),
    )
    .limit(1);

  if (existingTranslation?.status === "approved" && !input.force) {
    return err({ code: "approved_locked" });
  }

  const fetched = await fetchVideoBytesFromUrl(key.sourceText);
  if (!fetched.ok) {
    return err(mapFetchError(fetched.error));
  }

  const duration = assertMp4DurationSupported(fetched.value.content);
  if (!duration.ok) {
    return err({ code: duration.error.code });
  }

  const prompt = buildVideoLocalizationPrompt({
    filename: fetched.value.filename,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    instructions: input.instructions,
  });

  let localized: { video: Buffer; mimeType: string };
  try {
    const result = await regenerateVideoFromAttachment(
      fetched.value.content,
      fetched.value.contentType,
      prompt,
      {
        organizationId: input.organizationId,
        operationKey: `video-localization:url:${input.projectId}:${input.translationKeyId}:${input.targetLocale}`,
        source: "project_video_url_translation",
        dimensions: {
          channel: "project",
          project_id: input.projectId,
          target_locale: input.targetLocale,
        },
      },
      duration.value.durationSeconds,
    );
    localized = { video: result.video, mimeType: result.mimeType || "video/mp4" };
  } catch (error) {
    return err(mapGenerationError(error));
  }

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.actorUserId ?? null,
    role: "output",
    sourceKind: "job_output",
    filename: localizedVideoOutputFilename(fetched.value.filename, input.targetLocale),
    contentType: localized.mimeType,
    content: localized.video,
    metadata: publicMediaMetadata({
      videoLocalizationOutput: true,
      contentKind: VIDEO_URL_CONTENT_KIND,
      translationKeyId: key.id,
      sourceUrl: key.sourceText,
      targetLocale: input.targetLocale,
      durationSeconds: duration.value.durationSeconds,
    }),
  });

  const assetUrl = publicMediaAssetUrl({
    fileId: stored.id,
    origin: input.origin,
  });

  await db
    .update(schema.projectTranslationKeys)
    .set({
      metadata: contentKindMetadata(key.metadata, VIDEO_URL_CONTENT_KIND),
      updatedAt: new Date(),
    })
    .where(eq(schema.projectTranslationKeys.id, key.id));

  const [translation] = await db
    .insert(schema.projectTranslations)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyId: key.id,
      targetLocale: input.targetLocale,
      text: assetUrl,
      status: "needs_review",
      provenance: "agent",
      metadata: {
        contentKind: VIDEO_URL_CONTENT_KIND,
        storedFileId: stored.id,
      },
    })
    .onConflictDoUpdate({
      target: [
        schema.projectTranslations.translationKeyId,
        schema.projectTranslations.targetLocale,
      ],
      set: {
        text: assetUrl,
        status: "needs_review",
        provenance: "agent",
        reviewedByUserId: null,
        reviewedAt: null,
        metadata: {
          contentKind: VIDEO_URL_CONTENT_KIND,
          storedFileId: stored.id,
        },
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!translation) {
    return err({ code: "key_not_found" });
  }

  return ok({ translation, assetUrl, storedFileId: stored.id });
}

export async function replaceVideoUrlTranslationBytes(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  origin?: string | null;
  content: Buffer;
  contentType: string;
  filename: string;
  actorUserId?: string | null;
  force?: boolean;
}): Promise<
  Result<
    {
      translation: typeof schema.projectTranslations.$inferSelect;
      assetUrl: string;
      storedFileId: string;
    },
    VideoUrlContentKindError
  >
> {
  const [key] = await db
    .select()
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.id, input.translationKeyId),
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
      ),
    )
    .limit(1);

  if (!key) {
    return err({ code: "key_not_found" });
  }

  const [existingTranslation] = await db
    .select()
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.translationKeyId, key.id),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
      ),
    )
    .limit(1);

  if (existingTranslation?.status === "approved" && !input.force) {
    return err({ code: "approved_locked" });
  }

  const duration = assertMp4DurationSupported(input.content);
  if (!duration.ok) {
    return err({ code: duration.error.code });
  }

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.actorUserId ?? null,
    role: "asset",
    sourceKind: "chat_upload",
    filename: input.filename,
    contentType: input.contentType || "video/mp4",
    content: input.content,
    metadata: publicMediaMetadata({
      videoLocalizationManualUpload: true,
      contentKind: VIDEO_URL_CONTENT_KIND,
      translationKeyId: key.id,
      targetLocale: input.targetLocale,
      durationSeconds: duration.value.durationSeconds,
    }),
  });

  const assetUrl = publicMediaAssetUrl({
    fileId: stored.id,
    origin: input.origin,
  });

  await db
    .update(schema.projectTranslationKeys)
    .set({
      metadata: contentKindMetadata(key.metadata, VIDEO_URL_CONTENT_KIND),
      updatedAt: new Date(),
    })
    .where(eq(schema.projectTranslationKeys.id, key.id));

  const [translation] = await db
    .insert(schema.projectTranslations)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyId: key.id,
      targetLocale: input.targetLocale,
      text: assetUrl,
      status: "needs_review",
      provenance: "manual",
      metadata: {
        contentKind: VIDEO_URL_CONTENT_KIND,
        storedFileId: stored.id,
      },
    })
    .onConflictDoUpdate({
      target: [
        schema.projectTranslations.translationKeyId,
        schema.projectTranslations.targetLocale,
      ],
      set: {
        text: assetUrl,
        status: "needs_review",
        provenance: "manual",
        reviewedByUserId: null,
        reviewedAt: null,
        metadata: {
          contentKind: VIDEO_URL_CONTENT_KIND,
          storedFileId: stored.id,
        },
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!translation) {
    return err({ code: "key_not_found" });
  }

  return ok({ translation, assetUrl, storedFileId: stored.id });
}
