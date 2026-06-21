import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const publicTranslationProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const downloadPublicTranslationsQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  locale: z.string().trim().min(1).max(32),
});

export type PublicTranslationProjectParams = z.infer<typeof publicTranslationProjectParamsSchema>;
export type DownloadPublicTranslationsQuery = z.infer<typeof downloadPublicTranslationsQuerySchema>;
