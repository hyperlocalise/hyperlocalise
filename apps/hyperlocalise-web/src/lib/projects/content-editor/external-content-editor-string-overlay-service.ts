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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createStoredFile, deleteStoredFile } from "@/lib/file-storage/records";
import {
  IMAGE_URL_CONTENT_KIND,
  isImageUrlContentKind,
} from "@/lib/projects/files/image-url-translation-service";
import { publicMediaAssetUrl, publicMediaMetadata } from "@/lib/projects/files/public-media";
import { looksLikeImageUrl } from "@/lib/translation/file-formats";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type ExternalContentEditorStringOverlay =
  typeof schema.projectContentEditorStringOverlays.$inferSelect;

export type ExternalContentEditorStringOverlayError = { code: "overlay_not_found" };

export async function setExternalContentEditorStringTreatAsImage(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  externalResourceId: string;
  externalStringId: string;
  treatAsImage: boolean;
  actorUserId?: string | null;
}): Promise<Result<ExternalContentEditorStringOverlay, ExternalContentEditorStringOverlayError>> {
  const [existing] = await db
    .select()
    .from(schema.projectContentEditorStringOverlays)
    .where(
      and(
        eq(schema.projectContentEditorStringOverlays.organizationId, input.organizationId),
        eq(schema.projectContentEditorStringOverlays.projectId, input.projectId),
        eq(schema.projectContentEditorStringOverlays.sourcePath, input.sourcePath),
        eq(schema.projectContentEditorStringOverlays.externalResourceId, input.externalResourceId),
        eq(schema.projectContentEditorStringOverlays.externalStringId, input.externalStringId),
      ),
    )
    .limit(1);

  const metadata = { ...existing?.metadata };
  if (input.treatAsImage) {
    metadata.contentKind = IMAGE_URL_CONTENT_KIND;
  } else {
    delete metadata.contentKind;
  }

  if (existing) {
    const [updated] = await db
      .update(schema.projectContentEditorStringOverlays)
      .set({
        metadata,
        updatedByUserId: input.actorUserId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectContentEditorStringOverlays.id, existing.id))
      .returning();

    if (!updated) {
      return err({ code: "overlay_not_found" });
    }

    return ok(updated);
  }

  const [created] = await db
    .insert(schema.projectContentEditorStringOverlays)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      externalResourceId: input.externalResourceId,
      externalStringId: input.externalStringId,
      metadata,
      updatedByUserId: input.actorUserId ?? null,
    })
    .returning();

  if (!created) {
    return err({ code: "overlay_not_found" });
  }

  return ok(created);
}

export async function getExternalContentEditorStringOverlays(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  externalResourceId: string;
  externalStringIds: string[];
}): Promise<Map<string, ExternalContentEditorStringOverlay>> {
  const result = new Map<string, ExternalContentEditorStringOverlay>();
  if (input.externalStringIds.length === 0) {
    return result;
  }

  const rows = await db
    .select()
    .from(schema.projectContentEditorStringOverlays)
    .where(
      and(
        eq(schema.projectContentEditorStringOverlays.organizationId, input.organizationId),
        eq(schema.projectContentEditorStringOverlays.projectId, input.projectId),
        eq(schema.projectContentEditorStringOverlays.sourcePath, input.sourcePath),
        eq(schema.projectContentEditorStringOverlays.externalResourceId, input.externalResourceId),
        inArray(
          schema.projectContentEditorStringOverlays.externalStringId,
          input.externalStringIds,
        ),
      ),
    );

  for (const row of rows) {
    result.set(row.externalStringId, row);
  }

  return result;
}

export async function getExternalContentEditorStringOverlay(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  externalResourceId: string;
  externalStringId: string;
}): Promise<ExternalContentEditorStringOverlay | null> {
  const overlays = await getExternalContentEditorStringOverlays({
    ...input,
    externalStringIds: [input.externalStringId],
  });
  return overlays.get(input.externalStringId) ?? null;
}

export function enrichExternalContentEditorSegmentImageFields<
  T extends {
    sourceText: string;
    contentKind?: "text" | "image_file" | "image_url" | "video_file" | "video_url" | "office_file";
    sourceAssetUrl?: string | null;
    looksLikeImageUrl?: boolean;
  },
>(segment: T, overlay?: ExternalContentEditorStringOverlay | null): T {
  const treatAsImage = isImageUrlContentKind(overlay?.metadata);
  const looksLikeUrl = looksLikeImageUrl(segment.sourceText) || treatAsImage;

  return {
    ...segment,
    ...(treatAsImage
      ? {
          contentKind: IMAGE_URL_CONTENT_KIND,
          sourceAssetUrl: segment.sourceText,
        }
      : {}),
    ...(looksLikeUrl ? { looksLikeImageUrl: true } : {}),
  };
}

export function enrichExternalContentEditorTranslationImageFields<
  T extends {
    text: string;
    contentKind?: "text" | "image_file" | "image_url" | "video_file" | "video_url" | "office_file";
    targetAssetUrl?: string | null;
  },
>(translation: T, overlay?: ExternalContentEditorStringOverlay | null): T {
  const treatAsImage = isImageUrlContentKind(overlay?.metadata);
  if (!treatAsImage) {
    return translation;
  }

  const targetAssetUrl =
    /^https?:\/\//i.test(translation.text) || translation.text.startsWith("/api/public/media/")
      ? translation.text
      : null;

  return {
    ...translation,
    contentKind: IMAGE_URL_CONTENT_KIND,
    ...(targetAssetUrl ? { targetAssetUrl } : {}),
  };
}

export async function enrichExternalContentEditorFileImageFields<
  T extends {
    sourcePath: string;
    provider?: { externalResourceId?: string | null } | null;
    segments: Array<{
      externalStringId: string;
      sourceText: string;
      contentKind?:
        | "text"
        | "image_file"
        | "image_url"
        | "video_file"
        | "video_url"
        | "office_file";
      sourceAssetUrl?: string | null;
      looksLikeImageUrl?: boolean;
    }>;
  },
>(input: { organizationId: string; projectId: string; contentEditorFile: T }): Promise<T> {
  const externalResourceId = input.contentEditorFile.provider?.externalResourceId;
  if (!externalResourceId) {
    return {
      ...input.contentEditorFile,
      segments: input.contentEditorFile.segments.map((segment) =>
        enrichExternalContentEditorSegmentImageFields(segment, null),
      ),
    };
  }

  const overlays = await getExternalContentEditorStringOverlays({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.contentEditorFile.sourcePath,
    externalResourceId,
    externalStringIds: input.contentEditorFile.segments.map((segment) => segment.externalStringId),
  });

  return {
    ...input.contentEditorFile,
    segments: input.contentEditorFile.segments.map((segment) =>
      enrichExternalContentEditorSegmentImageFields(
        segment,
        overlays.get(segment.externalStringId),
      ),
    ),
  };
}

/** Store a manually uploaded image and return a public Hyperlocalise media URL. */
export async function storeExternalContentEditorImageUpload(input: {
  organizationId: string;
  projectId: string;
  externalStringId: string;
  externalResourceId: string;
  sourcePath: string;
  targetLocale: string;
  origin?: string | null;
  content: Buffer;
  contentType: string;
  filename: string;
  actorUserId?: string | null;
}): Promise<{ assetUrl: string; storedFileId: string }> {
  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.actorUserId ?? null,
    role: "asset",
    sourceKind: "chat_upload",
    filename: input.filename,
    contentType: input.contentType,
    content: input.content,
    metadata: publicMediaMetadata({
      imageLocalizationManualUpload: true,
      contentKind: IMAGE_URL_CONTENT_KIND,
      externalStringId: input.externalStringId,
      externalResourceId: input.externalResourceId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
    }),
  });

  const assetUrl = publicMediaAssetUrl({
    fileId: stored.id,
    origin: input.origin,
  });

  return { assetUrl, storedFileId: stored.id };
}

/** Best-effort cleanup when provider write-back fails after storing public media. */
export async function cleanupFailedExternalContentEditorImageUpload(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
}) {
  await deleteStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: input.storedFileId,
  });
}
