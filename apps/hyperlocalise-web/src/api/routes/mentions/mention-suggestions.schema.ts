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

export const mentionSuggestionsQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  projectId: z.string().trim().min(1).max(128).optional(),
  issueId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type MentionSuggestionsQuery = z.infer<typeof mentionSuggestionsQuerySchema>;
