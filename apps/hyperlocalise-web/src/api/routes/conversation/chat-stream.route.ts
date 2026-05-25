import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import {
  createConversationToolLoopAgent,
  loadInteractionModelMessages,
} from "@/lib/agents/hyperlocalise-agent";
import { db, schema } from "@/lib/database";
import { addInteractionMessage } from "@/lib/interactions";

import { conversationIdParamsSchema } from "./conversation.schema";

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

      const [conversation] = await db
        .select({
          id: schema.interactions.id,
          source: schema.interactions.source,
          projectId: schema.interactions.projectId,
        })
        .from(schema.interactions)
        .where(
          and(
            eq(schema.interactions.id, conversationId),
            eq(schema.interactions.organizationId, orgId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return c.json({ error: "not_found" }, 404);
      }

      if (conversation.source !== "chat_ui") {
        return c.json({ error: "conversation_not_replyable" }, 400);
      }

      const chatMessages = await loadInteractionModelMessages(conversationId);
      const agent = createConversationToolLoopAgent({
        surface: "web",
        toolContext: {
          conversationId,
          organizationId: orgId,
          localUserId: c.var.auth.user.localUserId,
          membershipRole: c.var.auth.membership.role,
          projectId: conversation.projectId ?? null,
          db,
        },
        onFinish: async ({ text }) => {
          try {
            await addInteractionMessage({
              interactionId: conversationId,
              senderType: "agent",
              text,
            });
          } catch (error) {
            console.error("Failed to persist agent message:", error);
          }
        },
      });

      const result = await agent.stream({ messages: chatMessages });

      return result.toUIMessageStreamResponse({ sendReasoning: true, sendSources: true });
    });
}
