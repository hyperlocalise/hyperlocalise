import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { isAiActionAllowed } from "@/api/auth/capability-guards";
import { canAccessInteraction } from "@/api/auth/team-access";
import { forbiddenResponse } from "@/api/response.schema";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { createWebChatAgentUIStreamResponse } from "@/agents/hyperlocalise/agent/channels/web";
import { db, schema } from "@/lib/database";
import { interactionHasTranslationAttachments } from "@/lib/conversations/interactions";

import { conversationIdParamsSchema } from "./conversation.schema";
import { extractLastUserMessage } from "./chat-stream-message";

const chatRequestBodySchema = z.object({
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

export function createChatStreamRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .post("/", async (c) => {
      const paramResult = conversationIdParamsSchema.safeParse(c.req.param());
      if (!paramResult.success) {
        return c.json({ error: "not_found" }, 404);
      }

      const { conversationId } = paramResult.data;
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const conversation = await canAccessInteraction(c.var.auth, conversationId);
      if (!conversation) {
        return c.json({ error: "not_found" }, 404);
      }

      if (!isAiActionAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      if (conversation.source !== "chat_ui") {
        return c.json({ error: "conversation_not_replyable" }, 400);
      }

      const bodyResult = chatRequestBodySchema.safeParse(await c.req.json());
      if (!bodyResult.success) {
        return c.json({ error: "invalid_chat_payload" }, 400);
      }

      const requestUserMessage = extractLastUserMessage(bodyResult.data.messages);
      if (!requestUserMessage?.id || !requestUserMessage.text.trim()) {
        return c.json({ error: "invalid_chat_payload" }, 400);
      }

      const [[targetUserMessage], [latestUserMessage]] = await Promise.all([
        db
          .select({
            id: schema.interactionMessages.id,
            text: schema.interactionMessages.text,
          })
          .from(schema.interactionMessages)
          .where(
            and(
              eq(schema.interactionMessages.id, requestUserMessage.id),
              eq(schema.interactionMessages.interactionId, conversationId),
              eq(schema.interactionMessages.senderType, "user"),
            ),
          )
          .limit(1),
        db
          .select({ id: schema.interactionMessages.id })
          .from(schema.interactionMessages)
          .where(
            and(
              eq(schema.interactionMessages.interactionId, conversationId),
              eq(schema.interactionMessages.senderType, "user"),
            ),
          )
          .orderBy(desc(schema.interactionMessages.createdAt))
          .limit(1),
      ]);

      if (!targetUserMessage) {
        return c.json({ error: "user_message_not_found" }, 404);
      }

      if (!latestUserMessage || latestUserMessage.id !== targetUserMessage.id) {
        return c.json({ error: "stale_user_message" }, 409);
      }

      const hasTranslationAttachments = await interactionHasTranslationAttachments(conversationId);

      return createWebChatAgentUIStreamResponse({
        conversationId,
        messageText: targetUserMessage.text,
        toolContext: {
          conversationId,
          organizationId: orgId,
          localUserId: c.var.auth.user.localUserId,
          membershipRole: c.var.auth.membership.role,
          projectId: conversation.projectId ?? null,
          db,
        },
        hasTranslationAttachments,
        usageOperationKey: `chat-agent-turn:${targetUserMessage.id}:agent_runs`,
        abortSignal: c.req.raw.signal,
      });
    });
}
