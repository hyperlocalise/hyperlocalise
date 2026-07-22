/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

export const conversationIdParamsSchema = z.object({
  conversationId: z.uuid(),
});

export const createConversationRequestSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  projectId: optionalProjectIdSchema,
  repositoryFullName: z.string().trim().min(1).max(255).optional(),
});

export const listConversationsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  projectId: optionalProjectIdSchema,
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
