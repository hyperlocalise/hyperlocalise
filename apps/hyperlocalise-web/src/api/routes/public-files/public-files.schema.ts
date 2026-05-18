import { z } from "zod";

export const maxPublicUploadBytes = 25 * 1024 * 1024;

export const uploadBodySchema = z.object({
  projectId: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1).max(2048).optional(),
  sourceHash: z.string().trim().min(1).max(256).optional(),
  commitSha: z.string().trim().min(1).max(256).optional(),
  workflowRunId: z.string().trim().min(1).max(256).optional(),
});

export const fileParamsSchema = z.object({
  fileId: z.string().trim().min(1),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
export type FileParams = z.infer<typeof fileParamsSchema>;
