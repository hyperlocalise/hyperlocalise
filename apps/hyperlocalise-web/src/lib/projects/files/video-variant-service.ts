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
import { ManagedAiCreditAccessError } from "@/lib/billing/managed-ai-credit";
import {
  buildVideoLocalizationPrompt,
  localizedVideoOutputFilename,
} from "@/lib/agents/video-localization";
import { db, schema } from "@/lib/database/client";
import { createStoredFile, getStoredFileContent } from "@/lib/file-storage/records";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  MAX_PUBLIC_VIDEO_HTTP_RESPONSE_BYTES,
  assertResolvablePublicHttpUrl,
  readBoundedResponseBody,
  withPublicHttpFetch,
} from "@/lib/security/public-http-fetch";
import { assertMp4DurationSupported } from "@/lib/translation/mp4-duration";

export type ProjectVideoVariantStatus =
  (typeof schema.projectTranslationStatusEnum.enumValues)[number];
export type ProjectVideoVariantProvenance =
  (typeof schema.projectTranslationProvenanceEnum.enumValues)[number];

export type VideoVariantError =
  | { code: "variant_not_found" }
  | { code: "source_file_not_found" }
  | { code: "source_bytes_missing" }
  | { code: "approved_locked" }
  | { code: "video_fetch_failed"; message: string }
  | { code: "video_ssrf_blocked" }
  | { code: "unsupported_video_format" }
  | { code: "video_duration_unreadable" }
  | { code: "video_duration_unsupported" }
  | { code: "video_model_unavailable" }
  | { code: "video_edit_region_blocked" }
  | {
      code: "ai_credit_insufficient";
      requiredAmountUsd: number;
      remainingAmountUsd: number;
    }
  | { code: "ai_credit_unavailable"; message: string }
  | { code: "video_localization_failed"; message: string };

export function projectVideoAssetPath(input: {
  organizationSlug: string;
  projectId: string;
  fileId: string;
}) {
  return `/api/orgs/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/assets/${encodeURIComponent(input.fileId)}`;
}

export async function ensureVideoVariantsForSourceFile(input: {
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
        .insert(schema.projectVideoVariants)
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
            schema.projectVideoVariants.projectId,
            schema.projectVideoVariants.sourcePath,
            schema.projectVideoVariants.targetLocale,
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

export async function getVideoVariant(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  db?: typeof db;
}) {
  const database = input.db ?? db;
  const [row] = await database
    .select()
    .from(schema.projectVideoVariants)
    .where(
      and(
        eq(schema.projectVideoVariants.organizationId, input.organizationId),
        eq(schema.projectVideoVariants.projectId, input.projectId),
        eq(schema.projectVideoVariants.sourcePath, input.sourcePath),
        eq(schema.projectVideoVariants.targetLocale, input.targetLocale),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateVideoVariantStatus(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  status: ProjectVideoVariantStatus;
  actorUserId?: string | null;
  db?: typeof db;
}): Promise<Result<typeof schema.projectVideoVariants.$inferSelect, VideoVariantError>> {
  const database = input.db ?? db;
  const existing = await getVideoVariant(input);
  if (!existing) {
    return err({ code: "variant_not_found" });
  }

  const reviewedAt = input.status === "approved" || input.status === "rejected" ? new Date() : null;

  const [updated] = await database
    .update(schema.projectVideoVariants)
    .set({
      status: input.status,
      reviewedByUserId: input.actorUserId ?? null,
      reviewedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.projectVideoVariants.id, existing.id))
    .returning();

  if (!updated) {
    return err({ code: "variant_not_found" });
  }

  return ok(updated);
}

async function loadSourceVideoBytes(input: {
  organizationId: string;
  storedFileId: string;
}): Promise<Result<{ content: Buffer; contentType: string; filename: string }, VideoVariantError>> {
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

export async function fetchVideoBytesFromUrl(
  url: string,
): Promise<Result<{ content: Buffer; contentType: string; filename: string }, VideoVariantError>> {
  const urlResult = await assertResolvablePublicHttpUrl(url);
  if (isErr(urlResult)) {
    return err({ code: "video_ssrf_blocked" });
  }

  try {
    return await withPublicHttpFetch(
      url,
      { method: "GET", redirect: "error" },
      async (response) => {
        if (!response.ok) {
          return err({
            code: "video_fetch_failed",
            message: `video fetch failed with status ${response.status}`,
          });
        }

        const contentType =
          (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
        if (contentType && contentType !== "video/mp4" && contentType !== "application/mp4") {
          return err({ code: "unsupported_video_format" });
        }

        const body = await readBoundedResponseBody(response, MAX_PUBLIC_VIDEO_HTTP_RESPONSE_BYTES);
        const content = Buffer.from(body);
        let filename = "video.mp4";
        try {
          const pathname = new URL(url).pathname;
          const base = pathname.split("/").filter(Boolean).at(-1);
          if (base) {
            filename = base;
          }
        } catch {
          // keep default
        }

        return ok({ content, contentType: contentType || "video/mp4", filename });
      },
      { maxResponseSize: MAX_PUBLIC_VIDEO_HTTP_RESPONSE_BYTES },
    );
  } catch (error) {
    return err({
      code: "video_fetch_failed",
      message: error instanceof Error ? error.message : "video fetch failed",
    });
  }
}

function mapGenerationError(error: unknown): VideoVariantError {
  if (error instanceof ManagedAiCreditAccessError) {
    return error.billingError.code === "ai_credit_insufficient"
      ? {
          code: "ai_credit_insufficient",
          requiredAmountUsd: error.billingError.requiredAmountUsd,
          remainingAmountUsd: error.billingError.remainingAmountUsd,
        }
      : { code: "ai_credit_unavailable", message: error.message };
  }
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

export async function localizeAndStoreVideoVariant(input: {
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
  provenance: ProjectVideoVariantProvenance;
  sourceJobId?: string | null;
  createdByUserId?: string | null;
  force?: boolean;
}): Promise<Result<typeof schema.projectVideoVariants.$inferSelect, VideoVariantError>> {
  const existing = await getVideoVariant({
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
    const loaded = await loadSourceVideoBytes({
      organizationId: input.organizationId,
      storedFileId: input.sourceStoredFileId,
    });
    if (!loaded.ok) {
      return loaded;
    }
    sourceBytes = loaded.value;
  } else if (input.sourceUrl) {
    const fetched = await fetchVideoBytesFromUrl(input.sourceUrl);
    if (!fetched.ok) {
      return fetched;
    }
    sourceBytes = fetched.value;
  } else {
    return err({ code: "source_bytes_missing" });
  }

  const duration = assertMp4DurationSupported(sourceBytes.content);
  if (!duration.ok) {
    return err(
      duration.error.code === "video_duration_unreadable"
        ? { code: "video_duration_unreadable" }
        : { code: "video_duration_unsupported" },
    );
  }

  const prompt = buildVideoLocalizationPrompt({
    filename: sourceBytes.filename,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    instructions: input.instructions,
  });

  let localized: { video: Buffer; mimeType: string };
  try {
    const result = await regenerateVideoFromAttachment(
      sourceBytes.content,
      sourceBytes.contentType,
      prompt,
      {
        organizationId: input.organizationId,
        operationKey: `video-localization:variant:${input.projectId}:${input.sourcePath}:${input.targetLocale}`,
        source: "project_video_variant",
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

  const outputFilename = localizedVideoOutputFilename(sourceBytes.filename, input.targetLocale);

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId ?? null,
    role: "output",
    sourceKind: "job_output",
    sourceJobId: input.sourceJobId ?? null,
    filename: outputFilename,
    contentType: localized.mimeType,
    content: localized.video,
    metadata: {
      videoLocalizationOutput: true,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      durationSeconds: duration.value.durationSeconds,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    },
  });

  await ensureVideoVariantsForSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    repositorySourceFileId: input.repositorySourceFileId,
    externalTmsFileId: input.externalTmsFileId,
    targetLocales: [input.targetLocale],
  });

  const [updated] = await db
    .update(schema.projectVideoVariants)
    .set({
      storedFileId: stored.id,
      status: "needs_review",
      provenance: input.provenance,
      sourceJobId: input.sourceJobId ?? null,
      reviewedByUserId: null,
      reviewedAt: null,
      metadata: {
        durationSeconds: duration.value.durationSeconds,
        contentType: localized.mimeType,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.projectVideoVariants.projectId, input.projectId),
        eq(schema.projectVideoVariants.sourcePath, input.sourcePath),
        eq(schema.projectVideoVariants.targetLocale, input.targetLocale),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: "variant_not_found" });
  }

  return ok(updated);
}

export async function replaceVideoVariantBytes(input: {
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
}): Promise<Result<typeof schema.projectVideoVariants.$inferSelect, VideoVariantError>> {
  const existing = await getVideoVariant(input);
  if (existing?.status === "approved" && !input.force) {
    return err({ code: "approved_locked" });
  }

  const duration = assertMp4DurationSupported(input.content);
  if (!duration.ok) {
    return err(
      duration.error.code === "video_duration_unreadable"
        ? { code: "video_duration_unreadable" }
        : { code: "video_duration_unsupported" },
    );
  }

  const stored = await createStoredFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdByUserId: input.createdByUserId ?? null,
    role: "asset",
    sourceKind: "chat_upload",
    filename: input.filename,
    contentType: input.contentType || "video/mp4",
    content: input.content,
    metadata: {
      videoLocalizationManualUpload: true,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      durationSeconds: duration.value.durationSeconds,
    },
  });

  await ensureVideoVariantsForSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    repositorySourceFileId: input.repositorySourceFileId,
    externalTmsFileId: input.externalTmsFileId,
    targetLocales: [input.targetLocale],
  });

  const [updated] = await db
    .update(schema.projectVideoVariants)
    .set({
      storedFileId: stored.id,
      status: "needs_review",
      provenance: "manual",
      reviewedByUserId: null,
      reviewedAt: null,
      metadata: {
        durationSeconds: duration.value.durationSeconds,
        contentType: input.contentType || "video/mp4",
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.projectVideoVariants.projectId, input.projectId),
        eq(schema.projectVideoVariants.sourcePath, input.sourcePath),
        eq(schema.projectVideoVariants.targetLocale, input.targetLocale),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: "variant_not_found" });
  }

  return ok(updated);
}
