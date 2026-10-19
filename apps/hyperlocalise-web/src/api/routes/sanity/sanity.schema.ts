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

export const sanityProjectIdParamSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
});

export const sanityDatasetParamsSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  dataset: z.string().trim().min(1).max(128),
});

export const upsertSanityConnectionBodySchema = z.object({
  apiToken: z.string().trim().min(1).max(4096),
});

export const sanityLocaleCatalogQuerySchema = z.object({
  localeType: z.string().trim().min(1).max(128).optional(),
  tagField: z.string().trim().min(1).max(64).optional(),
  titleField: z.string().trim().min(1).max(64).optional(),
});

export const sanityDocumentTypesQuerySchema = z
  .object({
    typeNames: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [],
      ),
    sourceLocale: z.string().trim().min(1).max(32).optional(),
  })
  .merge(sanityLocaleCatalogQuerySchema);
