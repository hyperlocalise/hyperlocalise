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

import { canonicalizeLocale } from "@/lib/i18n/locales";

export const ENGINE_SETUP_MAX_REVIEW_BATCH = 200;
export const ENGINE_SETUP_RUN_LIST_LIMIT = 10;

export const startEngineSetupRunBodySchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  sourceLocale: z
    .string()
    .trim()
    .max(40)
    .optional()
    .refine((value) => value == null || canonicalizeLocale(value) != null, {
      message: "sourceLocale must be a valid locale tag",
    }),
});

export const engineSetupRunParamsSchema = z.object({
  runId: z.string().uuid(),
});

export const reviewEngineSetupSuggestionsBodySchema = z.object({
  suggestionIds: z.array(z.string().uuid()).min(1).max(ENGINE_SETUP_MAX_REVIEW_BATCH),
  status: z.enum(["pending", "accepted", "rejected"]),
});

export const applyEngineSetupRunBodySchema = z.object({
  // Omit to create a new glossary named after the site.
  glossaryId: z.string().uuid().nullish(),
});
