import { Hono } from "hono";
import { createWebAdapter } from "@chat-adapter/web";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat, type Thread } from "chat";

import { isAiActionAllowed } from "@/api/auth/capability-guards";
import { canAccessInteraction } from "@/api/auth/team-access";
import { forbiddenResponse } from "@/api/response.schema";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import {
  buildTranslationAttachmentRequiredMessage,
  createConversationToolLoopAgent,
  loadInteractionModelMessages,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { db } from "@/lib/database";
import {
  addInteractionMessage,
  interactionHasTranslationAttachments,
} from "@/lib/conversations/interactions";

import { conversationIdParamsSchema } from "./conversation.schema";

type WebInboxBotState = Record<string, unknown>;

async function postStreamingAgentReply(
  thread: Thread<WebInboxBotState>,
  stream: AsyncIterable<string>,
) {
  let text = "";

  async function* captureTextStream() {
    for await (const chunk of stream) {
      text += chunk;
      yield chunk;
    }
  }

  await thread.post(captureTextStream());

  return text;
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

        const hasTranslationAttachments =
          await interactionHasTranslationAttachments(conversationId);
        if (!hasTranslationAttachments) {
          const text = buildTranslationAttachmentRequiredMessage("web");
          await thread.post(text);
          await addInteractionMessage({
            interactionId: conversationId,
            senderType: "agent",
            text,
          });
          return;
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
          userMessageText: message.text,
        });

        const result = await agent.stream({ messages: chatMessages });
        const text = await postStreamingAgentReply(thread, result.textStream);

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
