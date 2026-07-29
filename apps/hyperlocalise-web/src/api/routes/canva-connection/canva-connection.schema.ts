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
  projectId: projectIdSchema,
  sourceLocale: z.string().trim().min(1).max(32).default("en"),
  targetLocales: z
    .array(z.string().trim().min(1).max(32))
    .min(1)
    .max(20)
    .default(["es", "fr", "de"]),
  enabled: z.boolean().optional(),
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
  sourceLocale: z.string().trim().min(1).max(32).optional(),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(20).optional(),
});

export const localizeCanvaJobIdParamSchema = z.object({
  jobId: z.string().trim().min(1),
});
