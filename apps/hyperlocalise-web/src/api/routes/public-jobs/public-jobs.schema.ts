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

export const createPublicJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    projectId: projectIdSchema,
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

export const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1).max(128),
});

export const latestPublicJobQuerySchema = z.object({
  projectId: projectIdSchema,
  sourcePath: z.string().trim().min(1).max(2048),
});

export type CreatePublicJobBody = z.infer<typeof createPublicJobBodySchema>;
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;
export type LatestPublicJobQuery = z.infer<typeof latestPublicJobQuerySchema>;
