import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const publicImageProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const downloadPublicImageQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  locale: z.string().trim().min(1).max(32),
});

export type PublicImageProjectParams = z.infer<typeof publicImageProjectParamsSchema>;
export type DownloadPublicImageQuery = z.infer<typeof downloadPublicImageQuerySchema>;
