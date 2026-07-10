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

function extractLastUserText(messages: Array<{ role: string; parts?: unknown[] }> | undefined) {
  if (!messages?.length) {
    return "";
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts
      .flatMap((part) => {
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return [part.text];
        }
        return [];
      })
      .join("\n");
  }

  return "";
}

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

      const messageText = extractLastUserText(bodyResult.data.messages);
      if (!messageText.trim()) {
        return c.json({ error: "invalid_chat_payload" }, 400);
      }

      const [latestUserMessage] = await db
        .select({ id: schema.interactionMessages.id })
        .from(schema.interactionMessages)
        .where(
          and(
            eq(schema.interactionMessages.interactionId, conversationId),
            eq(schema.interactionMessages.senderType, "user"),
          ),
        )
        .orderBy(desc(schema.interactionMessages.createdAt))
        .limit(1);
      const hasTranslationAttachments = await interactionHasTranslationAttachments(conversationId);

      return createWebChatAgentUIStreamResponse({
        conversationId,
        messageText,
        toolContext: {
          conversationId,
          organizationId: orgId,
          localUserId: c.var.auth.user.localUserId,
          membershipRole: c.var.auth.membership.role,
          projectId: conversation.projectId ?? null,
          db,
        },
        hasTranslationAttachments,
        usageOperationKey: latestUserMessage
          ? `chat-agent-turn:${latestUserMessage.id}:agent_runs`
          : undefined,
        abortSignal: c.req.raw.signal,
      });
    });
}
