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

export const webChatAgentParamsSchema = z.object({
  organizationSlug: z.string().trim().min(1).max(128),
  automationId: z.uuid(),
});

export const webChatConversationParamsSchema = webChatAgentParamsSchema.extend({
  conversationId: z.uuid(),
});

export const webChatFileParamsSchema = webChatAgentParamsSchema.extend({
  fileId: z.string().trim().min(1).max(128),
});

export const webChatStreamBodySchema = z.object({
  id: z.string().optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        parts: z.array(z.unknown()).optional(),
      }),
    )
    .optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});
