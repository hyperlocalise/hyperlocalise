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

import type { ApiKeyPermission } from "@/api/routes/api-key/api-key.schema";
import { projectIdSchema, optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

/** Least-required PAT scopes for Figma plugin routes. */
export const FIGMA_SESSION_PERMISSION = "files:read" satisfies ApiKeyPermission;
export const FIGMA_PROJECTS_PERMISSION = "files:read" satisfies ApiKeyPermission;
export const FIGMA_JOB_READ_PERMISSION = "jobs:read" satisfies ApiKeyPermission;
export const FIGMA_JOB_WRITE_PERMISSION = "jobs:write" satisfies ApiKeyPermission;
export const FIGMA_FILES_READ_PERMISSION = "files:read" satisfies ApiKeyPermission;
export const FIGMA_FILES_WRITE_PERMISSION = "files:write" satisfies ApiKeyPermission;
export const FIGMA_TRANSLATIONS_PERMISSION = "files:read" satisfies ApiKeyPermission;

export const figmaSegmentSchema = z.object({
  key: z.string().min(1).max(256),
  nodeId: z.string().min(1).max(128),
  regionIndex: z.number().int().min(0).max(10_000),
  text: z.string().max(20_000),
});

const stampedSegmentKeySchema = z
  .string()
  .min(1)
  .max(256)
  .refine((key) => key.startsWith("figma.k."), {
    message: "segment key must be a figma.k.* stamp",
  });

export const collectFigmaPageBodySchema = z.object({
  projectId: projectIdSchema.optional(),
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  fileName: z.string().min(1).max(256).optional(),
  pageName: z.string().min(1).max(256).optional(),
  segments: z
    .array(
      figmaSegmentSchema.extend({
        key: stampedSegmentKeySchema,
      }),
    )
    .min(1)
    .max(5_000),
});

export const figmaLocalesQuerySchema = z.object({
  projectId: optionalProjectIdSchema,
  fileKey: z.string().min(1).max(128),
  pageIds: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1).max(128)).min(1).max(50)),
});

export const createFigmaJobBodySchema = z.object({
  projectId: projectIdSchema.optional(),
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  fileName: z.string().min(1).max(256).optional(),
  pageName: z.string().min(1).max(256).optional(),
  sourceLocale: z.string().min(2).max(32).optional(),
  targetLocales: z.array(z.string().min(2).max(32)).min(1).max(50).optional(),
  generate: z.boolean().optional().default(true),
  segments: z
    .array(
      figmaSegmentSchema.extend({
        key: stampedSegmentKeySchema,
      }),
    )
    .max(5_000)
    .optional(),
});

export const figmaJobIdParamSchema = z.object({
  jobId: z.string().min(1).max(128),
});

export const currentFigmaJobQuerySchema = z.object({
  projectId: optionalProjectIdSchema,
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
});

export const pullFigmaTranslationsQuerySchema = z.object({
  projectId: projectIdSchema,
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  locale: z.string().min(1).max(32).optional(),
});

export type CreateFigmaJobBody = z.infer<typeof createFigmaJobBodySchema>;
