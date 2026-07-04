import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const localizeCanvaDesignBodySchema = z.object({
  organizationId: z.string().uuid(),
  projectId: projectIdSchema,
  designToken: z.string().trim().min(1),
  segments: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        pageIndex: z.number().int().nonnegative(),
        contentIndex: z.number().int().nonnegative(),
        regionIndex: z.number().int().nonnegative(),
        text: z.string().trim().min(1),
      }),
    )
    .min(1),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20),
  rememberBrandOrgBinding: z.boolean().optional(),
});

export const localizeCanvaJobIdParamSchema = z.object({
  jobId: z.string().trim().min(1),
});

export const canvaOrganizationIdQuerySchema = z.object({
  organizationId: z.string().uuid(),
});

export const canvaProjectsQuerySchema = z.object({
  organizationId: z.string().uuid(),
});
