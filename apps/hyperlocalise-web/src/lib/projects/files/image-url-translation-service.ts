import { and, eq } from "drizzle-orm";

import {
  buildImageLocalizationPrompt,
  localizedImageOutputFilename,
} from "@/lib/agents/image-localization";
import { regenerateImageFromAttachment } from "@/lib/agents/image-generation";
import { db, schema } from "@/lib/database";
import { createStoredFile } from "@/lib/file-storage/records";
import {
  fetchImageBytesFromUrl,
  projectImageAssetUrl,
} from "@/lib/projects/files/image-variant-service";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const IMAGE_URL_CONTENT_KIND = "image_url" as const;

export type ImageUrlContentKindError =
  | { code: "key_not_found" }
  | { code: "fetch_failed"; message: string }
  | { code: "unsupported_image_response" }
  | { code: "localization_failed"; message: string }
  | { code: "approved_locked" };

export function isImageUrlContentKind(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.contentKind === IMAGE_URL_CONTENT_KIND;
}

export async function setTranslationKeyTreatAsImage(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  treatAsImage: boolean;
}): Promise<Result<typeof schema.projectTranslationKeys.$inferSelect, ImageUrlContentKindError>> {
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

  const metadata = { ...key.metadata };
  if (input.treatAsImage) {
    metadata.contentKind = IMAGE_URL_CONTENT_KIND;
  } else {
    delete metadata.contentKind;
  }

  const [updated] = await db
    .update(schema.projectTranslationKeys)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(schema.projectTranslationKeys.id, key.id))
    .returning();

  if (!updated) {
    return err({ code: "key_not_found" });
  }

  return ok(updated);
}

export async function localizeImageUrlTranslation(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  sourceLocale?: string | null;
  organizationSlug: string;
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
    ImageUrlContentKindError
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

  const fetched = await fetchImageBytesFromUrl(key.sourceText);
  if (!fetched.ok) {
    if (fetched.error.code === "fetch_failed") {
      return err({ code: "fetch_failed", message: fetched.error.message });
    }
    if (fetched.error.code === "unsupported_image_response") {
      return err({ code: "unsupported_image_response" });
    }
    return err({
      code: "fetch_failed",
      message: "image fetch failed",
    });
  }

  const prompt = buildImageLocalizationPrompt({
    attachment: {
      type: "image",
      name: fetched.value.filename,
      mimeType: fetched.value.contentType,
      data: fetched.value.content,
    },
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    instructions: input.instructions,
  });

  let localized: { image: Buffer; mimeType: string };
  try {
    const result = await regenerateImageFromAttachment(
      fetched.value.content,
      fetched.value.contentType,
      prompt,
    );
    localized = { image: result.image, mimeType: result.mimeType || "image/png" };
  } catch (error) {
    return err({
      code: "localization_failed",
      message: error instanceof Error ? error.message : "image localization failed",
    });
  }

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.actorUserId ?? null,
    role: "output",
    sourceKind: "job_output",
    filename: localizedImageOutputFilename(
      fetched.value.filename,
      input.targetLocale,
      localized.mimeType,
    ),
    contentType: localized.mimeType,
    content: localized.image,
    metadata: {
      imageLocalizationOutput: true,
      contentKind: IMAGE_URL_CONTENT_KIND,
      translationKeyId: key.id,
      sourceUrl: key.sourceText,
      targetLocale: input.targetLocale,
    },
  });

  const assetUrl = projectImageAssetUrl({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    fileId: stored.id,
    origin: input.origin,
  });

  const metadata = { ...key.metadata, contentKind: IMAGE_URL_CONTENT_KIND };
  await db
    .update(schema.projectTranslationKeys)
    .set({ metadata, updatedAt: new Date() })
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
        contentKind: IMAGE_URL_CONTENT_KIND,
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
          contentKind: IMAGE_URL_CONTENT_KIND,
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
