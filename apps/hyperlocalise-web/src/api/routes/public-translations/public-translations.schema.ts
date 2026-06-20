import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const publicTranslationProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const listPublicTranslationsQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  locales: z.string().trim().min(1).max(512).optional(),
});

export const upsertPublicTranslationsBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  sourceLocale: z.string().trim().min(1).max(32),
  entries: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(500),
        context: z.string().trim().max(500).optional(),
        locale: z.string().trim().min(1).max(32),
        value: z.string().max(100_000),
      }),
    )
    .min(1)
    .max(5_000),
});

export type PublicTranslationProjectParams = z.infer<typeof publicTranslationProjectParamsSchema>;
export type ListPublicTranslationsQuery = z.infer<typeof listPublicTranslationsQuerySchema>;
export type UpsertPublicTranslationsBody = z.infer<typeof upsertPublicTranslationsBodySchema>;
