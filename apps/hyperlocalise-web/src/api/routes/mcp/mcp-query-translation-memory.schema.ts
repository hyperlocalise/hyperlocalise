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

import { localeInputSchema } from "@/lib/i18n/locales";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const mcpQueryTranslationMemoryInputSchema = z.object({
  sourceText: z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .describe("Source text to find exact or similar translation-memory matches for."),

  sourceLocale: localeInputSchema.describe("Locale of the source text."),

  targetLocale: localeInputSchema.describe("Locale of the requested translations."),

  projectId: projectIdSchema
    .optional()
    .describe("Optional project whose linked translation memories should be searched."),

  memoryId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional()
    .describe("Optional translation memory to search exclusively."),

  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum number of ranked matches to return."),
});

export type McpQueryTranslationMemoryInput = z.infer<typeof mcpQueryTranslationMemoryInputSchema>;
