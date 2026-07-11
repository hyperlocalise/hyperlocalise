import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createStoredFile, deleteStoredFile } from "@/lib/file-storage/records";
import {
  IMAGE_URL_CONTENT_KIND,
  isImageUrlContentKind,
} from "@/lib/projects/files/image-url-translation-service";
import { publicMediaAssetUrl, publicMediaMetadata } from "@/lib/projects/files/public-media";
import { looksLikeImageUrl } from "@/lib/translation/file-formats";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type ExternalCatStringOverlay = typeof schema.projectCatStringOverlays.$inferSelect;

export type ExternalCatStringOverlayError = { code: "overlay_not_found" };

export async function setExternalCatStringTreatAsImage(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  externalResourceId: string;
  externalStringId: string;
  treatAsImage: boolean;
  actorUserId?: string | null;
}): Promise<Result<ExternalCatStringOverlay, ExternalCatStringOverlayError>> {
  const [existing] = await db
    .select()
    .from(schema.projectCatStringOverlays)
    .where(
      and(
        eq(schema.projectCatStringOverlays.organizationId, input.organizationId),
        eq(schema.projectCatStringOverlays.projectId, input.projectId),
        eq(schema.projectCatStringOverlays.sourcePath, input.sourcePath),
        eq(schema.projectCatStringOverlays.externalResourceId, input.externalResourceId),
        eq(schema.projectCatStringOverlays.externalStringId, input.externalStringId),
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
      .update(schema.projectCatStringOverlays)
      .set({
        metadata,
        updatedByUserId: input.actorUserId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectCatStringOverlays.id, existing.id))
      .returning();

    if (!updated) {
      return err({ code: "overlay_not_found" });
    }

    return ok(updated);
  }

  const [created] = await db
    .insert(schema.projectCatStringOverlays)
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

export async function getExternalCatStringOverlays(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  externalResourceId: string;
  externalStringIds: string[];
}): Promise<Map<string, ExternalCatStringOverlay>> {
  const result = new Map<string, ExternalCatStringOverlay>();
  if (input.externalStringIds.length === 0) {
    return result;
  }

  const rows = await db
    .select()
    .from(schema.projectCatStringOverlays)
    .where(
      and(
        eq(schema.projectCatStringOverlays.organizationId, input.organizationId),
        eq(schema.projectCatStringOverlays.projectId, input.projectId),
        eq(schema.projectCatStringOverlays.sourcePath, input.sourcePath),
        eq(schema.projectCatStringOverlays.externalResourceId, input.externalResourceId),
        inArray(schema.projectCatStringOverlays.externalStringId, input.externalStringIds),
      ),
    );

  for (const row of rows) {
    result.set(row.externalStringId, row);
  }

  return result;
}

export async function getExternalCatStringOverlay(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  externalResourceId: string;
  externalStringId: string;
}): Promise<ExternalCatStringOverlay | null> {
  const overlays = await getExternalCatStringOverlays({
    ...input,
    externalStringIds: [input.externalStringId],
  });
  return overlays.get(input.externalStringId) ?? null;
}

export function enrichExternalCatSegmentImageFields<
  T extends {
    sourceText: string;
    contentKind?: "text" | "image_file" | "image_url";
    sourceAssetUrl?: string | null;
    looksLikeImageUrl?: boolean;
  },
>(segment: T, overlay?: ExternalCatStringOverlay | null): T {
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

export function enrichExternalCatTranslationImageFields<
  T extends {
    text: string;
    contentKind?: "text" | "image_file" | "image_url";
    targetAssetUrl?: string | null;
  },
>(translation: T, overlay?: ExternalCatStringOverlay | null): T {
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

export async function enrichExternalCatFileImageFields<
  T extends {
    sourcePath: string;
    provider?: { externalResourceId?: string | null } | null;
    segments: Array<{
      externalStringId: string;
      sourceText: string;
      contentKind?: "text" | "image_file" | "image_url";
      sourceAssetUrl?: string | null;
      looksLikeImageUrl?: boolean;
    }>;
  },
>(input: { organizationId: string; projectId: string; catFile: T }): Promise<T> {
  const externalResourceId = input.catFile.provider?.externalResourceId;
  if (!externalResourceId) {
    return {
      ...input.catFile,
      segments: input.catFile.segments.map((segment) =>
        enrichExternalCatSegmentImageFields(segment, null),
      ),
    };
  }

  const overlays = await getExternalCatStringOverlays({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.catFile.sourcePath,
    externalResourceId,
    externalStringIds: input.catFile.segments.map((segment) => segment.externalStringId),
  });

  return {
    ...input.catFile,
    segments: input.catFile.segments.map((segment) =>
      enrichExternalCatSegmentImageFields(segment, overlays.get(segment.externalStringId)),
    ),
  };
}

/** Store a manually uploaded image and return a public Hyperlocalise media URL. */
export async function storeExternalCatImageUpload(input: {
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
export async function cleanupFailedExternalCatImageUpload(input: {
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
