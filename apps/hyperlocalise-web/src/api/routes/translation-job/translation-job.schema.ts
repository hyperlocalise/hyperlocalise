import { z } from "zod";

export const translationJobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

export const createTranslationJobBodySchema = z.object({
  projectId: z.string().trim().min(1),
  type: z.enum(["string", "file"]),
  inputPayload: z.unknown(),
});

export const listTranslationJobsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  status: z.enum(["queued", "running", "succeeded", "failed"]).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

export type TranslationJobIdParams = z.infer<typeof translationJobIdParamsSchema>;
export type CreateTranslationJobBody = z.infer<typeof createTranslationJobBodySchema>;
export type ListTranslationJobsQuery = z.infer<typeof listTranslationJobsQuerySchema>;
