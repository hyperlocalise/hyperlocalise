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

import {
  createGlossaryConceptTermBodySchema,
  glossaryIdParamsSchema,
  glossaryPartOfSpeechSchema,
} from "@/api/routes/glossary/glossary.schema";
import { localeInputSchema } from "@/lib/i18n/locales";

const glossaryTermShape = createGlossaryConceptTermBodySchema.shape;

export const mcpCreateGlossaryConceptInputSchema = z.object({
  glossaryId: glossaryIdParamsSchema.shape.glossaryId.describe(
    "ID of the native glossary where the concept should be created.",
  ),

  sourceLocale: localeInputSchema.describe("Locale of the source terminology."),

  sourceTerm: glossaryTermShape.term.describe("Source-language term for the concept."),

  targetLocale: localeInputSchema.describe("Locale of the target terminology."),

  targetTerm: glossaryTermShape.term.describe("Target-language term for the concept."),

  description: glossaryTermShape.description.describe(
    "Optional description of the concept and its intended meaning.",
  ),

  partOfSpeech: glossaryPartOfSpeechSchema
    .optional()
    .describe("Optional grammatical category shared by the terms."),

  forbidden: z
    .boolean()
    .default(false)
    .describe("Whether the target term must not be used in translations."),
});

export type McpCreateGlossaryConceptInput = z.infer<typeof mcpCreateGlossaryConceptInputSchema>;
