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

import { SPELLCHECK_MAX_WORD_LENGTH } from "@/lib/spellcheck-dictionary/normalize-word";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const dictionaryIdParamsSchema = z.object({
  dictionaryId: z.string().uuid(),
});

export const dictionaryWordIdParamsSchema = dictionaryIdParamsSchema.extend({
  wordId: z.string().uuid(),
});

export const dictionaryProjectParamsSchema = dictionaryIdParamsSchema.extend({
  projectId: projectIdSchema,
});

export const listDictionaryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    projectId: projectIdSchema.optional(),
  })
  .optional();

export const createDictionaryBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
});

export const updateDictionaryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.status !== undefined,
    { message: "at least one field must be provided" },
  );

export const listDictionaryWordsQuerySchema = z
  .object({
    locale: z.string().trim().min(1).max(50).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .optional();

export const createDictionaryWordBodySchema = z.object({
  locale: z.string().trim().min(1).max(50),
  word: z.string().trim().min(1).max(SPELLCHECK_MAX_WORD_LENGTH),
});

export const importDictionaryWordsBodySchema = z.object({
  locale: z.string().trim().min(1).max(50),
  content: z.string().min(1).max(1_000_000),
});

export const exportDictionaryWordsQuerySchema = z.object({
  locale: z.string().trim().min(1).max(50),
});

export const attachDictionaryProjectBodySchema = z.object({
  projectId: projectIdSchema,
  priority: z.number().int().min(0).max(10_000).optional().default(0),
});

export const attachProjectDictionaryBodySchema = z.object({
  dictionaryId: z.string().uuid(),
  priority: z.number().int().min(0).max(10_000).optional().default(0),
});

export const resolvedDictionaryQuerySchema = z.object({
  locale: z.string().trim().min(1).max(50),
});
