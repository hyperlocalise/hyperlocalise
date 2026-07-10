import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createStoredFile, getStoredFileContent } from "@/lib/file-storage/records";
import {
  buildImageLocalizationPrompt,
  localizedImageOutputFilename,
} from "@/lib/agents/image-localization";
import { regenerateImageFromAttachment } from "@/lib/agents/image-generation";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  MAX_PUBLIC_HTTP_RESPONSE_BYTES,
  readBoundedResponseBody,
  withPublicHttpFetch,
} from "@/lib/security/public-http-fetch";

export type ProjectImageVariantStatus =
  (typeof schema.projectTranslationStatusEnum.enumValues)[number];
export type ProjectImageVariantProvenance =
  (typeof schema.projectTranslationProvenanceEnum.enumValues)[number];

export type ImageVariantError =
  | { code: "variant_not_found" }
  | { code: "source_file_not_found" }
  | { code: "source_bytes_missing" }
  | { code: "approved_locked" }
  | { code: "fetch_failed"; message: string }
  | { code: "unsupported_image_response" }
  | { code: "localization_failed"; message: string };

export function projectImageAssetPath(input: {
  organizationSlug: string;
  projectId: string;
  fileId: string;
}) {
  return `/api/orgs/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/assets/${encodeURIComponent(input.fileId)}`;
}

export function projectImageAssetUrl(input: {
  organizationSlug: string;
  projectId: string;
  fileId: string;
  origin?: string | null;
}) {
  const path = projectImageAssetPath(input);
  if (!input.origin) {
    return path;
  }
  return `${input.origin.replace(/\/$/, "")}${path}`;
}

export async function ensureImageVariantsForSourceFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  repositorySourceFileId?: string | null;
  externalTmsFileId?: string | null;
  targetLocales: string[];
  db?: typeof db;
}) {
  const database = input.db ?? db;
  const locales = [...new Set(input.targetLocales.map((locale) => locale.trim()).filter(Boolean))];
  if (locales.length === 0) {
    return [];
  }

  const rows = await Promise.all(
    locales.map(async (targetLocale) => {
      const [row] = await database
        .insert(schema.projectImageVariants)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          repositorySourceFileId: input.repositorySourceFileId ?? null,
          externalTmsFileId: input.externalTmsFileId ?? null,
          sourcePath: input.sourcePath,
          targetLocale,
          status: "draft",
          provenance: "manual",
        })
        .onConflictDoUpdate({
          target: [
            schema.projectImageVariants.projectId,
            schema.projectImageVariants.sourcePath,
            schema.projectImageVariants.targetLocale,
          ],
          set: {
            repositorySourceFileId: input.repositorySourceFileId ?? null,
            externalTmsFileId: input.externalTmsFileId ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    }),
  );

  return rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function getImageVariant(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  db?: typeof db;
}) {
  const database = input.db ?? db;
  const [row] = await database
    .select()
    .from(schema.projectImageVariants)
    .where(
      and(
        eq(schema.projectImageVariants.organizationId, input.organizationId),
        eq(schema.projectImageVariants.projectId, input.projectId),
        eq(schema.projectImageVariants.sourcePath, input.sourcePath),
        eq(schema.projectImageVariants.targetLocale, input.targetLocale),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateImageVariantStatus(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  status: ProjectImageVariantStatus;
  actorUserId?: string | null;
  db?: typeof db;
}): Promise<Result<typeof schema.projectImageVariants.$inferSelect, ImageVariantError>> {
  const database = input.db ?? db;
  const existing = await getImageVariant(input);
  if (!existing) {
    return err({ code: "variant_not_found" });
  }

  const reviewedAt = input.status === "approved" || input.status === "rejected" ? new Date() : null;

  const [updated] = await database
    .update(schema.projectImageVariants)
    .set({
      status: input.status,
      reviewedByUserId: input.actorUserId ?? null,
      reviewedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.projectImageVariants.id, existing.id))
    .returning();

  if (!updated) {
    return err({ code: "variant_not_found" });
  }

  return ok(updated);
}

async function loadSourceImageBytes(input: {
  organizationId: string;
  storedFileId: string;
}): Promise<Result<{ content: Buffer; contentType: string; filename: string }, ImageVariantError>> {
  const [file] = await db
    .select({
      id: schema.storedFiles.id,
      contentType: schema.storedFiles.contentType,
      filename: schema.storedFiles.filename,
    })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.id, input.storedFileId),
        eq(schema.storedFiles.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!file) {
    return err({ code: "source_file_not_found" });
  }

  try {
    const stored = await getStoredFileContent({
      organizationId: input.organizationId,
      fileId: file.id,
    });
    return ok({
      content: stored.content,
      contentType: file.contentType,
      filename: file.filename,
    });
  } catch {
    return err({ code: "source_bytes_missing" });
  }
}

export async function fetchImageBytesFromUrl(
  url: string,
): Promise<Result<{ content: Buffer; contentType: string; filename: string }, ImageVariantError>> {
  try {
    return await withPublicHttpFetch(
      url,
      { method: "GET", redirect: "error" },
      async (response) => {
        if (!response.ok) {
          return err({
            code: "fetch_failed",
            message: `image fetch failed with status ${response.status}`,
          });
        }

        const contentType =
          (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
        if (!contentType.toLowerCase().startsWith("image/")) {
          return err({ code: "unsupported_image_response" });
        }

        const body = await readBoundedResponseBody(response, MAX_PUBLIC_HTTP_RESPONSE_BYTES);
        const content = Buffer.from(body);
        let filename = "image.png";
        try {
          const pathname = new URL(url).pathname;
          const base = pathname.split("/").filter(Boolean).at(-1);
          if (base) {
            filename = base;
          }
        } catch {
          // keep default
        }

        return ok({ content, contentType, filename });
      },
    );
  } catch (error) {
    return err({
      code: "fetch_failed",
      message: error instanceof Error ? error.message : "image fetch failed",
    });
  }
}

export async function localizeAndStoreImageVariant(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  sourceLocale?: string | null;
  sourceStoredFileId?: string | null;
  sourceUrl?: string | null;
  repositorySourceFileId?: string | null;
  externalTmsFileId?: string | null;
  instructions?: string | null;
  provenance: ProjectImageVariantProvenance;
  sourceJobId?: string | null;
  createdByUserId?: string | null;
  force?: boolean;
}): Promise<Result<typeof schema.projectImageVariants.$inferSelect, ImageVariantError>> {
  const existing = await getImageVariant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
  });

  if (existing?.status === "approved" && !input.force) {
    return err({ code: "approved_locked" });
  }

  let sourceBytes: { content: Buffer; contentType: string; filename: string };
  if (input.sourceStoredFileId) {
    const loaded = await loadSourceImageBytes({
      organizationId: input.organizationId,
      storedFileId: input.sourceStoredFileId,
    });
    if (!loaded.ok) {
      return loaded;
    }
    sourceBytes = loaded.value;
  } else if (input.sourceUrl) {
    const fetched = await fetchImageBytesFromUrl(input.sourceUrl);
    if (!fetched.ok) {
      return fetched;
    }
    sourceBytes = fetched.value;
  } else {
    return err({ code: "source_bytes_missing" });
  }

  const prompt = buildImageLocalizationPrompt({
    attachment: {
      type: "image",
      name: sourceBytes.filename,
      mimeType: sourceBytes.contentType,
      data: sourceBytes.content,
    },
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    instructions: input.instructions,
  });

  let localized: { image: Buffer; mimeType: string };
  try {
    const result = await regenerateImageFromAttachment(
      sourceBytes.content,
      sourceBytes.contentType,
      prompt,
    );
    localized = { image: result.image, mimeType: result.mimeType || "image/png" };
  } catch (error) {
    return err({
      code: "localization_failed",
      message: error instanceof Error ? error.message : "image localization failed",
    });
  }

  const outputFilename = localizedImageOutputFilename(
    sourceBytes.filename,
    input.targetLocale,
    localized.mimeType,
  );

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId ?? null,
    role: "output",
    sourceKind: "job_output",
    sourceJobId: input.sourceJobId ?? null,
    filename: outputFilename,
    contentType: localized.mimeType,
    content: localized.image,
    metadata: {
      imageLocalizationOutput: true,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    },
  });

  await ensureImageVariantsForSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    repositorySourceFileId: input.repositorySourceFileId,
    externalTmsFileId: input.externalTmsFileId,
    targetLocales: [input.targetLocale],
  });

  const [updated] = await db
    .update(schema.projectImageVariants)
    .set({
      storedFileId: stored.id,
      status: "needs_review",
      provenance: input.provenance,
      sourceJobId: input.sourceJobId ?? null,
      reviewedByUserId: null,
      reviewedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.projectImageVariants.projectId, input.projectId),
        eq(schema.projectImageVariants.sourcePath, input.sourcePath),
        eq(schema.projectImageVariants.targetLocale, input.targetLocale),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: "variant_not_found" });
  }

  return ok(updated);
}

export async function replaceImageVariantBytes(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  content: Buffer;
  contentType: string;
  filename: string;
  repositorySourceFileId?: string | null;
  externalTmsFileId?: string | null;
  createdByUserId?: string | null;
  force?: boolean;
}): Promise<Result<typeof schema.projectImageVariants.$inferSelect, ImageVariantError>> {
  const existing = await getImageVariant(input);
  if (existing?.status === "approved" && !input.force) {
    return err({ code: "approved_locked" });
  }

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId ?? null,
    role: "asset",
    sourceKind: "chat_upload",
    filename: input.filename,
    contentType: input.contentType,
    content: input.content,
    metadata: {
      imageLocalizationManualUpload: true,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
    },
  });

  await ensureImageVariantsForSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    repositorySourceFileId: input.repositorySourceFileId,
    externalTmsFileId: input.externalTmsFileId,
    targetLocales: [input.targetLocale],
  });

  const [updated] = await db
    .update(schema.projectImageVariants)
    .set({
      storedFileId: stored.id,
      status: "needs_review",
      provenance: "manual",
      reviewedByUserId: null,
      reviewedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.projectImageVariants.projectId, input.projectId),
        eq(schema.projectImageVariants.sourcePath, input.sourcePath),
        eq(schema.projectImageVariants.targetLocale, input.targetLocale),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: "variant_not_found" });
  }

  return ok(updated);
}
