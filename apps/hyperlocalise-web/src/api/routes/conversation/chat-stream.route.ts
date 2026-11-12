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
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { isAiActionAllowed } from "@/api/auth/capability-guards";
import { canAccessInteraction } from "@/api/auth/team-access";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import { conflictResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { createWebChatAgentUIStreamResponse } from "@/agents/hyperlocalise/agent/channels/web";
import { db, schema } from "@/lib/database/client";
import {
  claimConversationRun,
  getInteractionMessageToolOutput,
  getLatestConversationRun,
  isConversationRunStale,
  requestConversationRunCancel,
  type ConversationRunRecord,
} from "@/lib/conversations/conversation-runs";
import { interactionHasTranslationAttachments } from "@/lib/conversations/interactions";
import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";

import { resolveChatGlossarySearchCapability } from "./chat-glossary-search-capability";
import { resolveChatKnowledgeMemoryCapability } from "./chat-knowledge-memory-capability";
import {
  conversationIdParamsSchema,
  conversationToolOutputParamsSchema,
} from "./conversation.schema";
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

type CreateChatStreamRoutesOptions = {
  /** Keeps the process alive after the response until the agent turn ends. */
  deferAfterResponse?: (task: () => Promise<unknown>) => void;
};

/** The run as clients see it: a stale run reads as failed, since its process is gone. */
function serializeConversationRun(run: ConversationRunRecord) {
  return {
    id: run.id,
    userMessageId: run.userMessageId,
    status: isConversationRunStale(run) ? ("failed" as const) : run.status,
    agentMessageId: run.agentMessageId,
    cancelRequested: run.cancelRequestedAt !== null,
    parts: run.snapshotParts ?? [],
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function createChatStreamRoutes(options: CreateChatStreamRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/run", async (c) => {
      const paramResult = conversationIdParamsSchema.safeParse(c.req.param());
      if (!paramResult.success) {
        return notFoundResponse(c);
      }

      const conversation = await canAccessInteraction(c.var.auth, paramResult.data.conversationId);
      if (!conversation) {
        return notFoundResponse(c);
      }

      if (!isAiActionAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const run = await getLatestConversationRun(paramResult.data.conversationId);
      return c.json({ run: run ? serializeConversationRun(run) : null }, 200);
    })
    .post("/run/cancel", async (c) => {
      const paramResult = conversationIdParamsSchema.safeParse(c.req.param());
      if (!paramResult.success) {
        return notFoundResponse(c);
      }

      const conversation = await canAccessInteraction(c.var.auth, paramResult.data.conversationId);
      if (!conversation) {
        return notFoundResponse(c);
      }

      if (!isAiActionAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const run = await requestConversationRunCancel(paramResult.data.conversationId);
      if (!run) {
        return notFoundResponse(c, "run_not_found");
      }

      return c.json({ run: { id: run.id, status: run.status, cancelRequested: true } }, 202);
    })
    .get("/messages/:messageId/tool-outputs/:toolCallId", async (c) => {
      const paramResult = conversationToolOutputParamsSchema.safeParse(c.req.param());
      if (!paramResult.success) {
        return notFoundResponse(c);
      }

      const conversation = await canAccessInteraction(c.var.auth, paramResult.data.conversationId);
      if (!conversation) {
        return notFoundResponse(c);
      }

      if (!isAiActionAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const result = await getInteractionMessageToolOutput({
        interactionId: paramResult.data.conversationId,
        messageId: paramResult.data.messageId,
        toolCallId: paramResult.data.toolCallId,
      });
      if (!result.found) {
        return notFoundResponse(c, "tool_output_not_found");
      }

      return c.json({ toolOutput: { output: result.output } }, 200);
    })
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

      const aiFeaturesDenied = await rejectIfAiFeaturesUnavailable(
        c,
        c.var.auth.organization.localOrganizationId,
      );
      if (aiFeaturesDenied) {
        return aiFeaturesDenied;
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

      const [[targetUserMessage], [latestUserMessage], [latestMessage]] = await Promise.all([
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
        db
          .select({ senderType: schema.interactionMessages.senderType })
          .from(schema.interactionMessages)
          .where(eq(schema.interactionMessages.interactionId, conversationId))
          .orderBy(desc(schema.interactionMessages.createdAt), desc(schema.interactionMessages.id))
          .limit(1),
      ]);

      if (!targetUserMessage) {
        return c.json({ error: "user_message_not_found" }, 404);
      }

      if (!latestUserMessage || latestUserMessage.id !== targetUserMessage.id) {
        return c.json({ error: "stale_user_message" }, 409);
      }

      if (latestMessage?.senderType === "agent") {
        return conflictResponse(c, "turn_already_processed");
      }

      const operationKey = `chat-agent-turn:${targetUserMessage.id}:agent_runs`;
      const languageModelPromise = resolveHyperlocaliseAgentLanguageModel({
        organizationId: orgId,
      });
      const [
        hasTranslationAttachments,
        knowledgeMemoryEnabled,
        glossarySearchEnabled,
        languageModel,
      ] = await Promise.all([
        interactionHasTranslationAttachments(conversationId),
        resolveChatKnowledgeMemoryCapability(c.var.auth),
        resolveChatGlossarySearchCapability(c.var.auth),
        languageModelPromise,
      ]);

      // One turn per user message: a second tab, a retry or a reload joins the running turn.
      const claim = await claimConversationRun({
        interactionId: conversationId,
        organizationId: orgId,
        userMessageId: targetUserMessage.id,
      });
      if (claim.kind === "in_progress") {
        return conflictResponse(c, "run_in_progress", undefined, { runId: claim.run.id });
      }
      if (claim.kind === "already_processed") {
        return conflictResponse(c, "turn_already_processed", undefined, {
          runId: claim.run.id,
        });
      }

      return createWebChatAgentUIStreamResponse({
        conversationId,
        runId: claim.runId,
        messageText: targetUserMessage.text,
        toolContext: {
          conversationId,
          organizationId: orgId,
          localUserId: c.var.auth.user.localUserId,
          membershipRole: c.var.auth.membership.role,
          projectId: conversation.projectId ?? null,
          db,
          knowledgeMemoryEnabled,
          glossarySearchEnabled,
        },
        hasTranslationAttachments,
        usageOperationKey: operationKey,
        languageModel,
        deferAfterResponse: options.deferAfterResponse,
      });
    });
}
