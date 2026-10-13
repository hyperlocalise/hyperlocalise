/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { optionalProjectIdSchema, projectIdSchema } from "@/lib/projects/identity/project-id";

export const canvaConnectionIdParamSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createCanvaConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  apiKeyId: z.string().uuid(),
  projectId: projectIdSchema.optional(),
  enabled: z.boolean().optional(),
});

export const bindCanvaProjectBodySchema = z.object({
  projectId: projectIdSchema,
});

export const updateCanvaConnectionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(256).optional(),
  apiKeyId: z.string().uuid().optional(),
  projectId: optionalProjectIdSchema.optional(),
  enabled: z.boolean().optional(),
});

const canvaSegmentSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  text: z.string().trim().min(1),
  key: z.string().trim().min(1).optional(),
  contentIndex: z.number().int().nonnegative().optional(),
  regionIndex: z.number().int().nonnegative().optional(),
});

export const localizeCanvaDesignBodySchema = z.object({
  designToken: z.string().trim().min(1),
  designTitle: z.string().trim().max(256).optional(),
  segments: z.array(canvaSegmentSchema).min(1),
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
});

export const collectCanvaDesignBodySchema = localizeCanvaDesignBodySchema.omit({
  sourceLocale: true,
  targetLocales: true,
});

export const localizeCanvaJobIdParamSchema = z.object({
  jobId: z.string().trim().min(1),
});

export const createCanvaJobBodySchema = z
  .object({
    designToken: z.string().trim().min(1),
    designTitle: z.string().trim().max(256).optional(),
    segments: z.array(canvaSegmentSchema).min(1).optional(),
    sourceLocale: z.string().trim().min(1).max(32).optional(),
    targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
    generate: z.boolean().optional().default(true),
  })
  .refine((value) => Boolean(value.segments?.length || value.targetLocales?.length), {
    message: "segments or targetLocales is required",
  });

const canvaDesignQuerySchema = z
  .object({
    designId: z.string().trim().min(1).max(256).optional(),
    designToken: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.designId || value.designToken), {
    message: "designId or designToken is required",
  });

export const currentCanvaJobQuerySchema = canvaDesignQuerySchema;
export const canvaLocalesQuerySchema = canvaDesignQuerySchema;
export const pullCanvaTranslationsQuerySchema = canvaDesignQuerySchema.and(
  z.object({
    locale: z.string().trim().min(1).max(32).optional(),
    pageIndex: z.coerce.number().int().nonnegative().optional(),
  }),
);

export const canvaClaimIdParamSchema = z.object({
  claimId: z.string().uuid(),
});

export const completeCanvaClaimBodySchema = z.object({
  claimId: z.string().uuid(),
});

export type CreateCanvaJobBody = z.infer<typeof createCanvaJobBodySchema>;
