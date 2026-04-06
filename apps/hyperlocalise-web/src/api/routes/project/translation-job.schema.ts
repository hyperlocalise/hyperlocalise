import { z } from "zod";

import * as schema from "@/lib/database/schema";

export const translationJobProjectParamsSchema = z.object({
  projectId: z.string().trim().min(1),
});

export const translationJobParamsSchema = z.object({
  projectId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
});

const metadataSchema = z.record(z.string(), z.string()).optional();

const stringTranslationJobInputSchema = z.object({
  sourceText: z.string().trim().min(1).max(100_000),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
  metadata: metadataSchema,
  context: z.string().max(20_000).optional(),
  maxLength: z.int().positive().max(100_000).optional(),
});

const fileTranslationJobInputSchema = z.object({
  sourceFileId: z.string().trim().min(1),
  fileFormat: z.enum(["xliff", "json", "po", "csv"]),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
  metadata: metadataSchema,
});

export const createTranslationJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    stringInput: stringTranslationJobInputSchema,
  }),
  z.object({
    type: z.literal("file"),
    fileInput: fileTranslationJobInputSchema,
  }),
]);

export const translationJobListQuerySchema = z.object({
  type: z.enum(schema.translationJobTypeEnum.enumValues).optional(),
  status: z.enum(schema.translationJobStatusEnum.enumValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateTranslationJobBody = z.infer<typeof createTranslationJobBodySchema>;
