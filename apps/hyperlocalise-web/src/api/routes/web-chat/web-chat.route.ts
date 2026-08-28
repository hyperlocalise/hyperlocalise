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
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import { createWebChatAgentUIStreamResponse } from "@/agents/automations/workspace/agent/channels/web-chat";
import { createRequestBodyLimitMiddleware } from "@/api/middleware/request-body-limit";
import { extractLastUserMessage } from "@/api/routes/conversation/chat-stream-message";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  payloadTooLargeResponse,
} from "@/api/response.schema";
import { rejectWebChatBot } from "@/lib/agents/web-chat-bot-protection";
import {
  WEB_CHAT_MAX_IMAGE_BYTES,
  WEB_CHAT_MAX_IMAGE_FILES,
  WEB_CHAT_MAX_IMAGE_REQUEST_BYTES,
  WEB_CHAT_VISITOR_COOKIE_NAME,
  buildWebChatSourceThreadId,
  findWebChatInteraction,
  isWebChatImageContentType,
  resolvePublicWebChatAgent,
} from "@/lib/agents/workspace-automation-web-chat";
import { addInteractionMessage, createInteraction } from "@/lib/conversations/interactions";
import { db, schema } from "@/lib/database/client";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import { createStoredFile } from "@/lib/file-storage/records";

import {
  webChatAgentParamsSchema,
  webChatConversationParamsSchema,
  webChatFileParamsSchema,
  webChatStreamBodySchema,
} from "./web-chat.schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asFiles(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((item): item is File => item instanceof File && item.size > 0);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function publicWebChatFileUrl(input: {
  organizationSlug: string;
  automationId: string;
  fileId: string;
}) {
  return `/api/public/web-chat/${encodeURIComponent(input.organizationSlug)}/${encodeURIComponent(input.automationId)}/files/${encodeURIComponent(input.fileId)}`;
}

function storeVisitorCookie(c: Parameters<typeof setCookie>[0], visitorId: string) {
  setCookie(c, WEB_CHAT_VISITOR_COOKIE_NAME, visitorId, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
}

function readVisitorId(c: Parameters<typeof getCookie>[0]) {
  const existing = getCookie(c, WEB_CHAT_VISITOR_COOKIE_NAME)?.trim();
  if (existing && UUID_RE.test(existing)) {
    return existing;
  }
  return randomUUID();
}

const imageUploadBodyLimit = createRequestBodyLimitMiddleware({
  maxSize: WEB_CHAT_MAX_IMAGE_REQUEST_BYTES,
  onError: (c) => payloadTooLargeResponse(c, "upload_too_large"),
});

type CreateWebChatRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createWebChatRoutes(options: CreateWebChatRoutesOptions = {}) {
  return new Hono()
    .get("/:organizationSlug/:automationId", async (c) => {
      const parsed = webChatAgentParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return notFoundResponse(c, "web_chat_not_found");
      }

      const agent = await resolvePublicWebChatAgent(parsed.data);
      if (!agent) {
        return notFoundResponse(c, "web_chat_not_found");
      }

      return c.json(
        {
          agent: {
            id: agent.automation.id,
            name: agent.automation.name,
            status: agent.automation.status,
            organizationName: agent.organization.name,
          },
        },
        200,
      );
    })
    .get("/:organizationSlug/:automationId/conversation", async (c) => {
      const parsed = webChatAgentParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return notFoundResponse(c, "web_chat_not_found");
      }

      const agent = await resolvePublicWebChatAgent(parsed.data);
      if (!agent) {
        return notFoundResponse(c, "web_chat_not_found");
      }

      const visitorId = readVisitorId(c);
      storeVisitorCookie(c, visitorId);

      const interaction = await findWebChatInteraction({
        organizationId: agent.organization.id,
        automationId: agent.automation.id,
        visitorId,
      });

      if (!interaction) {
        return c.json({ conversation: null, messages: [] }, 200);
      }

      const messages = await listConversationMessages(interaction.id);
      return c.json(
        {
          conversation: { id: interaction.id, title: interaction.title },
          messages,
        },
        200,
      );
    })
    .post("/:organizationSlug/:automationId/messages", imageUploadBodyLimit, async (c) => {
      const botRejection = await rejectWebChatBot(c);
      if (botRejection) {
        return botRejection;
      }

      const parsed = webChatAgentParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return notFoundResponse(c, "web_chat_not_found");
      }

      const agent = await resolvePublicWebChatAgent(parsed.data);
      if (!agent) {
        return notFoundResponse(c, "web_chat_not_found");
      }
      if (agent.automation.status !== "active") {
        return forbiddenResponse(c, "web_chat_unavailable", "This chat is currently unavailable.");
      }

      const visitorId = readVisitorId(c);
      storeVisitorCookie(c, visitorId);

      const body = await c.req.parseBody({ all: true });
      const text = (asString(body.text) ?? "").trim();
      const files = asFiles(body.files);
      if (!text && files.length === 0) {
        return badRequestResponse(c, "invalid_chat_payload", "A message or image is required.");
      }
      if (files.length > WEB_CHAT_MAX_IMAGE_FILES) {
        return badRequestResponse(c, "too_many_files", undefined, {
          maxFiles: WEB_CHAT_MAX_IMAGE_FILES,
        });
      }

      for (const file of files) {
        if (!isWebChatImageContentType(file.type)) {
          return badRequestResponse(c, "unsupported_image_type", undefined, {
            filename: file.name,
          });
        }
        if (file.size > WEB_CHAT_MAX_IMAGE_BYTES) {
          return c.json({ error: "upload_too_large" }, 413);
        }
      }

      const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
      let interaction = await findWebChatInteraction({
        organizationId: agent.organization.id,
        automationId: agent.automation.id,
        visitorId,
      });
      if (!interaction) {
        interaction = await createInteraction({
          organizationId: agent.organization.id,
          source: "web_chat",
          title: (text || "Image").slice(0, 120),
          sourceThreadId: buildWebChatSourceThreadId({
            automationId: agent.automation.id,
            visitorId,
          }),
        });
      }

      const storedFiles = await Promise.all(
        files.map(async (file) =>
          createStoredFile({
            organizationId: agent.organization.id,
            createdByUserId: null,
            role: "asset",
            sourceKind: "chat_upload",
            sourceInteractionId: interaction.id,
            filename: file.name,
            contentType: file.type,
            content: Buffer.from(await file.arrayBuffer()),
            metadata: {
              uploadSurface: "web_chat",
              automationId: agent.automation.id,
            },
            adapter,
          }),
        ),
      );

      const message = await addInteractionMessage({
        interactionId: interaction.id,
        senderType: "user",
        text: text || "Attached an image.",
        attachments: storedFiles.map((file) => ({
          id: file.id,
          filename: file.filename,
          contentType: file.contentType,
          url: publicWebChatFileUrl({
            organizationSlug: parsed.data.organizationSlug,
            automationId: parsed.data.automationId,
            fileId: file.id,
          }),
        })),
      });

      return c.json(
        {
          conversation: { id: interaction.id, title: interaction.title },
          message: serializeMessage(message, parsed.data),
        },
        201,
      );
    })
    .post("/:organizationSlug/:automationId/conversations/:conversationId/chat", async (c) => {
      const botRejection = await rejectWebChatBot(c);
      if (botRejection) {
        return botRejection;
      }

      const parsed = webChatConversationParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return notFoundResponse(c, "web_chat_not_found");
      }

      const agent = await resolvePublicWebChatAgent(parsed.data);
      if (!agent) {
        return notFoundResponse(c, "web_chat_not_found");
      }
      if (agent.automation.status !== "active") {
        return forbiddenResponse(c, "web_chat_unavailable", "This chat is currently unavailable.");
      }

      const visitorId = readVisitorId(c);
      const interaction = await findWebChatInteraction({
        organizationId: agent.organization.id,
        automationId: agent.automation.id,
        visitorId,
      });
      if (!interaction || interaction.id !== parsed.data.conversationId) {
        return notFoundResponse(c, "conversation_not_found");
      }

      const bodyResult = webChatStreamBodySchema.safeParse(await c.req.json());
      if (!bodyResult.success) {
        return badRequestResponse(c, "invalid_chat_payload");
      }

      const requestUserMessage = extractLastUserMessage(bodyResult.data.messages);
      if (!requestUserMessage?.id) {
        return badRequestResponse(c, "invalid_chat_payload");
      }

      const [[targetUserMessage], [latestUserMessage], [latestMessage]] = await Promise.all([
        db
          .select({ id: schema.interactionMessages.id })
          .from(schema.interactionMessages)
          .where(
            and(
              eq(schema.interactionMessages.id, requestUserMessage.id),
              eq(schema.interactionMessages.interactionId, interaction.id),
              eq(schema.interactionMessages.senderType, "user"),
            ),
          )
          .limit(1),
        db
          .select({ id: schema.interactionMessages.id })
          .from(schema.interactionMessages)
          .where(
            and(
              eq(schema.interactionMessages.interactionId, interaction.id),
              eq(schema.interactionMessages.senderType, "user"),
            ),
          )
          .orderBy(desc(schema.interactionMessages.createdAt), desc(schema.interactionMessages.id))
          .limit(1),
        db
          .select({
            id: schema.interactionMessages.id,
            senderType: schema.interactionMessages.senderType,
          })
          .from(schema.interactionMessages)
          .where(eq(schema.interactionMessages.interactionId, interaction.id))
          .orderBy(desc(schema.interactionMessages.createdAt), desc(schema.interactionMessages.id))
          .limit(1),
      ]);

      if (!targetUserMessage) {
        return notFoundResponse(c, "user_message_not_found");
      }

      if (!latestUserMessage || latestUserMessage.id !== targetUserMessage.id) {
        return conflictResponse(c, "stale_user_message");
      }

      if (latestMessage?.senderType === "agent") {
        return conflictResponse(c, "turn_already_processed");
      }

      return createWebChatAgentUIStreamResponse({
        conversationId: interaction.id,
        lastUserMessageId: targetUserMessage.id,
        automation: agent.automation,
        abortSignal: c.req.raw.signal,
      });
    })
    .get("/:organizationSlug/:automationId/files/:fileId", async (c) => {
      const parsed = webChatFileParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return notFoundResponse(c, "file_not_found");
      }

      const agent = await resolvePublicWebChatAgent(parsed.data);
      if (!agent) {
        return notFoundResponse(c, "file_not_found");
      }

      const [file] = await db
        .select()
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, parsed.data.fileId),
            eq(schema.storedFiles.organizationId, agent.organization.id),
          ),
        )
        .limit(1);

      if (!file?.sourceInteractionId) {
        return notFoundResponse(c, "file_not_found");
      }

      const [interaction] = await db
        .select({
          id: schema.interactions.id,
          source: schema.interactions.source,
          sourceThreadId: schema.interactions.sourceThreadId,
        })
        .from(schema.interactions)
        .where(eq(schema.interactions.id, file.sourceInteractionId))
        .limit(1);

      const visitorId = getCookie(c, WEB_CHAT_VISITOR_COOKIE_NAME)?.trim();
      const expectedThreadId =
        visitorId && UUID_RE.test(visitorId)
          ? buildWebChatSourceThreadId({
              automationId: agent.automation.id,
              visitorId,
            })
          : null;
      if (
        !interaction ||
        interaction.source !== "web_chat" ||
        !expectedThreadId ||
        interaction.sourceThreadId !== expectedThreadId
      ) {
        return notFoundResponse(c, "file_not_found");
      }

      const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
      const stored = await adapter.get({ keyOrUrl: file.storageKey });
      if (!stored) {
        return notFoundResponse(c, "file_not_found");
      }

      return new Response(stored.body, {
        status: 200,
        headers: {
          "Content-Type": file.contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    });
}

async function listConversationMessages(conversationId: string) {
  const rows = await db
    .select()
    .from(schema.interactionMessages)
    .where(eq(schema.interactionMessages.interactionId, conversationId))
    .orderBy(asc(schema.interactionMessages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    conversationId,
    senderType: row.senderType,
    text: row.text,
    parts: row.parts,
    attachments: row.attachments,
    createdAt: row.createdAt.toISOString(),
  }));
}

function serializeMessage(
  message: Awaited<ReturnType<typeof addInteractionMessage>>,
  params: { organizationSlug: string; automationId: string },
) {
  return {
    id: message.id,
    conversationId: message.interactionId,
    senderType: message.senderType,
    text: message.text,
    parts: message.parts,
    attachments: message.attachments,
    createdAt: message.createdAt.toISOString(),
    organizationSlug: params.organizationSlug,
    automationId: params.automationId,
  };
}
