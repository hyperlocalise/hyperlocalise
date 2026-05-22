import { z } from "zod";

export const fileParamsSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(128),
  fileId: z.string().trim().min(1).max(128),
});

export type FileParams = z.infer<typeof fileParamsSchema>;
