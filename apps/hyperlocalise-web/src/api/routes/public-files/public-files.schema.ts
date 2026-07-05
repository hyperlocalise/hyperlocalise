import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const maxPublicUploadBytes = 25 * 1024 * 1024;

export const uploadBodySchema = z.object({
  projectId: projectIdSchema,
  sourcePath: z.string().trim().min(1).max(2048),
  sourceHash: z.string().trim().min(1).max(256).optional(),
  commitSha: z.string().trim().min(1).max(256).optional(),
  workflowRunId: z.string().trim().min(1).max(256).optional(),
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  format: z.string().trim().min(1).max(64).optional(),
  branch: z.string().trim().min(1).max(256).optional(),
});

export const fileParamsSchema = z.object({
  fileId: z.string().trim().min(1).max(128),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
export type FileParams = z.infer<typeof fileParamsSchema>;
