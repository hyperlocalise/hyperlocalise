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

import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

export const conversationIdParamsSchema = z.object({
  conversationId: z.uuid(),
});

export const repositoryProviderSchema = z.enum(["github", "gitlab"]);

export const createConversationRequestSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  projectId: optionalProjectIdSchema,
  repositoryFullName: z.string().trim().min(1).max(255).optional(),
  repositoryProvider: repositoryProviderSchema.optional(),
});
