import { Hono } from "hono";

import { canAccessInteraction } from "@/api/auth/team-access";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import {
  buildTranslationAttachmentRequiredMessage,
  createConversationToolLoopAgent,
  loadInteractionModelMessages,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { db } from "@/lib/database";
import { addInteractionMessage, interactionHasTranslationAttachments } from "@/lib/interactions";

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

      const conversation = await canAccessInteraction(c.var.auth, conversationId);
      if (!conversation) {
        return c.json({ error: "not_found" }, 404);
      }

      if (conversation.source !== "chat_ui") {
        return c.json({ error: "conversation_not_replyable" }, 400);
      }

      const hasTranslationAttachments = await interactionHasTranslationAttachments(conversationId);
      if (!hasTranslationAttachments) {
        return c.json(
          {
            error: "translation_requires_attachment",
            message: buildTranslationAttachmentRequiredMessage("web"),
          },
          400,
        );
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
        hasFileAttachments: hasTranslationAttachments,
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
