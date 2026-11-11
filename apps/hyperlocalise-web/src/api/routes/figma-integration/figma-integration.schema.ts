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

import { projectIdSchema } from "@/lib/projects/identity/project-id";

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
  projectId: projectIdSchema,
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
  projectId: projectIdSchema,
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
  projectId: projectIdSchema,
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  fileName: z.string().min(1).max(256).optional(),
  pageName: z.string().min(1).max(256).optional(),
  sourceLocale: z.string().min(2).max(32).optional(),
  targetLocales: z.array(z.string().min(2).max(32)).min(1).max(50),
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
  projectId: projectIdSchema,
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
});

export const pullFigmaTranslationsQuerySchema = z.object({
  projectId: projectIdSchema,
  fileKey: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  locale: z.string().min(1).max(32).optional(),
});

export const matchFigmaKeysBodySchema = z.object({
  projectId: projectIdSchema,
  texts: z
    .array(
      z.object({
        nodeId: z.string().min(1).max(128),
        text: z.string().max(20_000),
        layerName: z.string().max(512).optional(),
      }),
    )
    .min(1)
    .max(2_000),
});

export const searchFigmaKeysQuerySchema = z.object({
  projectId: projectIdSchema,
  q: z.string().trim().min(1).max(256),
});

export const figmaKeyTranslationsBodySchema = z.object({
  projectId: projectIdSchema,
  locale: z.string().min(2).max(32),
  keyIds: z.array(z.uuid()).min(1).max(2_000),
});

const figmaMarkerSchema = z
  .object({
    left: z.number().min(0).max(100),
    top: z.number().min(0).max(100),
    width: z.number().gt(0).max(100),
    height: z.number().gt(0).max(100),
  })
  .refine((marker) => marker.left + marker.width <= 100.000001, {
    message: "marker exceeds the frame width",
  })
  .refine((marker) => marker.top + marker.height <= 100.000001, {
    message: "marker exceeds the frame height",
  });

const figmaDesignUrlSchema = z
  .url()
  .max(2048)
  .refine(
    (value) => {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (host === "figma.com" || host.endsWith(".figma.com"));
    },
    { message: "figmaUrl must be an https figma.com link" },
  );

/** About 10 MB of PNG as base64; go-svc re-checks the decoded size. */
const FIGMA_FRAME_IMAGE_MAX_BASE64 = 14_000_000;

export const syncFigmaVisualContextBodySchema = z.object({
  projectId: projectIdSchema,
  fileKey: z.string().min(1).max(128),
  nodeId: z.string().min(1).max(128),
  name: z.string().min(1).max(256).optional(),
  figmaUrl: figmaDesignUrlSchema,
  contentType: z.enum(["image/png", "image/jpeg"]),
  imageBase64: z.string().min(1).max(FIGMA_FRAME_IMAGE_MAX_BASE64),
  bindings: z
    .array(
      z.object({
        translationKeyId: z.uuid(),
        marker: figmaMarkerSchema.nullable(),
      }),
    )
    .min(1)
    .max(1_000),
});

export type CreateFigmaJobBody = z.infer<typeof createFigmaJobBodySchema>;
