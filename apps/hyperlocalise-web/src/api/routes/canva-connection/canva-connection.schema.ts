import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

export const canvaConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createCanvaConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  apiKeyId: z.string().uuid(),
  projectId: optionalProjectIdSchema,
  sourceLocale: z.string().trim().min(1).max(32).default("en"),
  targetLocales: z
    .array(z.string().trim().min(1).max(32))
    .min(1)
    .max(20)
    .default(["es", "fr", "de"]),
  enabled: z.boolean().default(true),
});

export const updateCanvaConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  apiKeyId: z.string().uuid().optional(),
  projectId: optionalProjectIdSchema.optional(),
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
  enabled: z.boolean().optional(),
});

export const localizeCanvaDesignBodySchema = z.object({
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
  projectId: optionalProjectIdSchema.optional(),
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
});
