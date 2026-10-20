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

const stampedSegmentKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine((key) => key.startsWith("sanity.k."), {
    message: "segment key must be a sanity.k.* stamp",
  });

export const sanitySegmentSchema = z.object({
  key: stampedSegmentKeySchema,
  documentId: z.string().min(1).max(256),
  documentType: z.string().min(1).max(128),
  text: z.string().max(20_000),
});

export const collectSanityDocumentBodySchema = z.object({
  projectId: projectIdSchema,
  sanityProjectId: z.string().min(1).max(128),
  dataset: z.string().min(1).max(128),
  documentId: z.string().min(1).max(256),
  documentType: z.string().min(1).max(128),
  documentTitle: z.string().min(1).max(256).optional(),
  segments: z.array(sanitySegmentSchema).min(1).max(5_000),
});

export const sanityLocalesQuerySchema = z.object({
  projectId: projectIdSchema,
  sanityProjectId: z.string().min(1).max(128),
  dataset: z.string().min(1).max(128),
  documentIds: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1).max(256)).min(1).max(50)),
});

const sanityJobDocumentSchema = z.object({
  sanityProjectId: z.string().min(1).max(128),
  dataset: z.string().min(1).max(128),
  documentId: z.string().min(1).max(256),
  documentType: z.string().min(1).max(128),
  documentTitle: z.string().min(1).max(256).optional(),
  segments: z.array(sanitySegmentSchema).max(5_000).optional(),
});

export const createSanityJobBodySchema = z.object({
  projectId: projectIdSchema,
  documents: z.array(sanityJobDocumentSchema).min(1).max(50),
  sourceLocale: z.string().min(2).max(32).optional(),
  targetLocales: z.array(z.string().min(2).max(32)).min(1).max(50),
  generate: z.boolean().optional().default(true),
});

export const sanityJobIdParamSchema = z.object({
  jobId: z.string().min(1).max(128),
});

export const applySanityPlanBodySchema = z.object({
  projectId: projectIdSchema,
  sourcePath: z.string().min(1).max(512),
  document: z.record(z.string(), z.unknown()),
  i18nMode: z.enum(["document", "field"]),
  sourceSanityLocale: z.string().min(2).max(32),
  targetSanityLocale: z.string().min(2).max(32),
});

export const currentSanityJobQuerySchema = z.object({
  projectId: projectIdSchema,
  sanityProjectId: z.string().min(1).max(128),
  dataset: z.string().min(1).max(128),
  documentId: z.string().min(1).max(256),
  documentType: z.string().min(1).max(128),
});

export const pullSanityTranslationsQuerySchema = z.object({
  projectId: projectIdSchema,
  sanityProjectId: z.string().min(1).max(128),
  dataset: z.string().min(1).max(128),
  documentId: z.string().min(1).max(256),
  documentType: z.string().min(1).max(128),
  locale: z.string().min(1).max(32).optional(),
});

const sanityImportEntryKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine((key) => key.startsWith("sanity.k."), {
    message: "import entry key must be a sanity.k.* stamp",
  });

export const importSanityTargetTranslationsBodySchema = z.object({
  projectId: projectIdSchema,
  sanityProjectId: z.string().min(1).max(128),
  dataset: z.string().min(1).max(128),
  documentId: z.string().min(1).max(256),
  documentType: z.string().min(1).max(128),
  targetLocale: z.string().min(2).max(32),
  entries: z
    .record(sanityImportEntryKeySchema, z.string().max(20_000))
    .refine((record) => Object.keys(record).length > 0, {
      message: "entries must include at least one translation",
    }),
});

export type CreateSanityJobBody = z.infer<typeof createSanityJobBodySchema>;
