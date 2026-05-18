import { z } from "zod";

import { supportedFileTranslationFileFormats } from "@/lib/translation/file-formats";

export const createPublicJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    projectId: z.string().trim().min(1),
    stringInput: z.object({
      sourceText: z.string().trim().min(1).max(100_000),
      sourceLocale: z.string().trim().min(1).max(32),
      targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
      metadata: z.record(z.string(), z.string()).optional(),
      context: z.string().max(20_000).optional(),
      maxLength: z.number().int().positive().max(100_000).optional(),
    }),
  }),
  z.object({
    type: z.literal("file"),
    projectId: z.string().trim().min(1),
    fileInput: z.object({
      sourceFileId: z.string().trim().min(1),
      fileFormat: z.enum(supportedFileTranslationFileFormats),
      sourceLocale: z.string().trim().min(1).max(32),
      targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  }),
]);

export const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

export type CreatePublicJobBody = z.infer<typeof createPublicJobBodySchema>;
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;
