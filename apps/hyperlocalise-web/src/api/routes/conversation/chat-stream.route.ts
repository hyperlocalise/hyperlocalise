import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { createWebAdapter } from "@chat-adapter/web";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat } from "chat";

import { isAiActionAllowed } from "@/api/auth/capability-guards";
import { canAccessInteraction } from "@/api/auth/team-access";
import { forbiddenResponse } from "@/api/response.schema";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import {
  postStreamingAgentReply,
  postWebClarificationReply,
  runWebChatAgentTurn,
} from "@/agents/hyperlocalise/agent/channels/web";
import { db, schema } from "@/lib/database";
import {
  addInteractionMessage,
  interactionHasTranslationAttachments,
} from "@/lib/conversations/interactions";

import { conversationIdParamsSchema } from "./conversation.schema";

type WebInboxBotState = Record<string, unknown>;

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

      const webAdapter = createWebAdapter({
        userName: "hyperlocalise",
        persistMessageHistory: false,
        getUser: async (request) => {
          const auth = await resolveApiAuthContextFromSession({
            cookie: request.headers.get("cookie") ?? undefined,
            organizationSlug: c.req.param("organizationSlug"),
          });

          if (!auth) {
            return null;
          }

          return {
            id: auth.user.localUserId,
            name: auth.user.email,
          };
        },
      });

      const bot = new Chat<{ web: typeof webAdapter }, WebInboxBotState>({
        adapters: { web: webAdapter },
        logger: "info",
        state: createMemoryState(),
        userName: "hyperlocalise",
      });

      bot.onDirectMessage(async (thread, message) => {
        const threadData = webAdapter.decodeThreadId(thread.id);
        if (threadData.conversationId !== conversationId) {
          throw new Error("web_thread_conversation_mismatch");
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
        const hasTranslationAttachments =
          await interactionHasTranslationAttachments(conversationId);

        const turn = await runWebChatAgentTurn({
          conversationId,
          messageText: message.text,
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
        });

        if (turn.clarificationFollowUp) {
          await postWebClarificationReply(thread, conversationId, turn.clarificationFollowUp);
          return;
        }

        if (!turn.textStream) {
          return;
        }

        const text = await postStreamingAgentReply(thread, turn.textStream);

        try {
          await addInteractionMessage({
            interactionId: conversationId,
            senderType: "agent",
            text,
          });
        } catch (error) {
          console.error("Failed to persist agent message:", error);
        }
      });

      return bot.webhooks.web(c.req.raw);
    });
}
