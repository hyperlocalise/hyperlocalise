import { z } from "zod";

import * as schema from "@/lib/database/schema";

export const jobProjectParamsSchema = z.object({
  projectId: z.string().trim().min(1),
});

export const jobParamsSchema = z.object({
  projectId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
});

const metadataSchema = z.record(z.string(), z.string()).optional();

export const stringTranslationJobInputSchema = z.object({
  sourceText: z.string().trim().min(1).max(100_000),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
  metadata: metadataSchema,
  context: z.string().max(20_000).optional(),
  maxLength: z.int().positive().max(100_000).optional(),
});

export const fileTranslationJobInputSchema = z.object({
  sourceFileId: z.string().trim().min(1),
  fileFormat: z.enum(["xliff", "json", "po", "csv"]),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
  metadata: metadataSchema,
});

export const createJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    stringInput: stringTranslationJobInputSchema,
  }),
  z.object({
    type: z.literal("file"),
    fileInput: fileTranslationJobInputSchema,
  }),
]);

export const jobListQuerySchema = z.object({
  type: z.enum(schema.translationJobTypeEnum.enumValues).optional(),
  status: z.enum(schema.jobStatusEnum.enumValues).optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateJobBody = z.infer<typeof createJobBodySchema>;
/**
 * @deprecated Use this only inside the translation job detail/worker path.
 */
export type StringTranslationJobInput = z.infer<typeof stringTranslationJobInputSchema>;
/**
 * @deprecated Use this only inside the translation job detail/worker path.
 */
export type FileTranslationJobInput = z.infer<typeof fileTranslationJobInputSchema>;
