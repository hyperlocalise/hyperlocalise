/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export const agentRequestSourceSchema = z.enum(["slack", "github", "chat_ui", "email"]);
export type AgentRequestSource = z.infer<typeof agentRequestSourceSchema>;

export const agentActorSchema = z.object({
  sourceUserId: z.string(),
  userId: z.string().optional(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  role: z.enum(["admin", "member"]).optional(),
});
export type AgentActor = z.infer<typeof agentActorSchema>;

export const agentRequestSchema = z.object({
  id: z.string(),
  source: agentRequestSourceSchema,
  organizationId: z.string(),
  projectId: z.string().nullable(),
  actor: agentActorSchema,
  sourceThreadId: z.string(),
  input: z.object({
    text: z.string(),
  }),
  idempotencyKey: z.string(),
  responsePolicy: z.object({
    type: z.enum(["stream", "thread_reply", "email_reply", "webhook_comment"]),
  }),
});

export type AgentRequest = z.infer<typeof agentRequestSchema>;
