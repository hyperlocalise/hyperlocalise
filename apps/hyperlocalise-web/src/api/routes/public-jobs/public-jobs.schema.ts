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
import { createHash } from "node:crypto";

import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";
import {
  maxTranslationMetadataEntries,
  maxTranslationTargetLocales,
} from "@/api/routes/project/job.schema";
import { supportedFileTranslationFileFormats } from "@/lib/translation/file-formats";

const publicJobMetadataSchema = z
  .record(z.string().max(100), z.string().max(1000))
  .refine((metadata) => Object.keys(metadata).length <= maxTranslationMetadataEntries, {
    message: `metadata must contain at most ${maxTranslationMetadataEntries} entries`,
  })
  .optional();

export const maxPublicJobIdempotencyKeyLength = 255;

/** Fields every public job takes, whatever its input. Stored as the in-app job editor stores them. */
const createPublicJobSharedFields = {
  title: z.string().trim().min(1).max(256).optional(),
  description: z.string().trim().max(2_048).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  ownerEmail: z.string().trim().email().max(320).optional(),
};

export const createPublicJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    projectId: projectIdSchema,
    ...createPublicJobSharedFields,
    stringInput: z.object({
      sourceText: z.string().trim().min(1).max(100_000),
      sourceLocale: z.string().trim().min(1).max(32),
      targetLocales: z
        .array(z.string().trim().min(1).max(32))
        .min(1)
        .max(maxTranslationTargetLocales),
      metadata: publicJobMetadataSchema,
      context: z.string().max(20_000).optional(),
      maxLength: z.number().int().positive().max(100_000).optional(),
    }),
  }),
  z.object({
    type: z.literal("file"),
    projectId: projectIdSchema,
    ...createPublicJobSharedFields,
    fileInput: z.object({
      sourceFileId: z.string().trim().min(1).max(128),
      fileFormat: z.enum(supportedFileTranslationFileFormats),
      sourceLocale: z.string().trim().min(1).max(32),
      targetLocales: z
        .array(z.string().trim().min(1).max(32))
        .min(1)
        .max(maxTranslationTargetLocales),
      metadata: publicJobMetadataSchema,
    }),
  }),
]);

// Printable ASCII without spaces, so keys compare exactly.
export const publicJobIdempotencyKeySchema = z
  .string()
  .min(1)
  .max(maxPublicJobIdempotencyKeyLength)
  .regex(/^[\x21-\x7e]+$/);

export const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1).max(128),
});

export type CreatePublicJobBody = z.infer<typeof createPublicJobBodySchema>;
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;

function sortedMetadata(metadata: Record<string, string> | undefined) {
  if (!metadata) {
    return undefined;
  }
  const keys = Object.keys(metadata).sort();
  if (keys.length === 0) {
    return undefined;
  }
  const sorted: Record<string, string> = {};
  for (const key of keys) {
    sorted[key] = metadata[key]!;
  }
  return sorted;
}

/**
 * SHA-256 of the create body after trimming, lowercasing `ownerEmail`,
 * normalising `dueAt` to UTC, and sorting metadata keys, so a retry that
 * only changes those forms still matches the first request.
 */
export function hashPublicJobRequest(payload: CreatePublicJobBody) {
  const title = payload.title || undefined;
  const description = payload.description || undefined;
  const dueAt = payload.dueAt ? new Date(payload.dueAt).toISOString() : undefined;
  const ownerEmail = payload.ownerEmail?.toLowerCase() || undefined;
  const shared = { title, description, dueAt, ownerEmail };

  const canonical =
    payload.type === "string"
      ? {
          type: payload.type,
          projectId: payload.projectId,
          ...shared,
          stringInput: {
            sourceText: payload.stringInput.sourceText,
            sourceLocale: payload.stringInput.sourceLocale,
            targetLocales: payload.stringInput.targetLocales,
            metadata: sortedMetadata(payload.stringInput.metadata),
            context: payload.stringInput.context,
            maxLength: payload.stringInput.maxLength,
          },
        }
      : {
          type: payload.type,
          projectId: payload.projectId,
          ...shared,
          fileInput: {
            sourceFileId: payload.fileInput.sourceFileId,
            fileFormat: payload.fileInput.fileFormat,
            sourceLocale: payload.fileInput.sourceLocale,
            targetLocales: payload.fileInput.targetLocales,
            metadata: sortedMetadata(payload.fileInput.metadata),
          },
        };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
