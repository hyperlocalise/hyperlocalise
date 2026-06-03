import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";

import { buildAccessibleInteractionsWhere, canAccessInteraction } from "@/api/auth/team-access";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { normalizeProjectId } from "@/lib/projects/project-id";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { getOwnedProject } from "@/api/routes/project/project.shared";
import { addInteractionMessage } from "@/lib/conversations/interactions";

import { createChatStreamRoutes } from "./chat-stream.route";
import { conversationIdParamsSchema, listConversationsQuerySchema } from "./conversation.schema";

const maxMessageUploadBytes = 25 * 1024 * 1024;
const maxMessageUploadFiles = 5;

function notFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "not_found" }, 404);
}

function badRequestResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_message_payload" }, 400);
}

async function cleanupStoredFiles(
  storedFiles: Array<typeof schema.storedFiles.$inferSelect>,
  adapter: FileStorageAdapter,
) {
  if (storedFiles.length === 0) {
    return;
  }

  await db.delete(schema.storedFiles).where(
    inArray(
      schema.storedFiles.id,
      storedFiles.map((file) => file.id),
    ),
  );
  await Promise.allSettled(
    storedFiles.map((file) => adapter.delete({ keyOrUrl: file.storageKey })),
  );
}

function tooManyFilesResponse(c: {
  json(body: { error: string; maxFiles: number }, status: 400): Response;
}) {
  return c.json({ error: "too_many_files", maxFiles: maxMessageUploadFiles }, 400);
}

const validateConversationParams = validator("param", (value, c) => {
  const parsed = conversationIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c);
  }
  return parsed.data;
});

const validateListQuery = validator("query", (value, c) => {
  const parsed = listConversationsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_query" }, 400);
  }
  return parsed.data;
});

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asFiles(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((item): item is File => item instanceof File && item.size > 0);
}

type CreateConversationRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createConversationRoutes(options: CreateConversationRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListQuery, async (c) => {
      const query = c.req.valid("query");

      const conditions = [await buildAccessibleInteractionsWhere(c.var.auth)];
      if (query.status) {
        conditions.push(eq(schema.inboxItems.status, query.status));
      }
      if (query.cursor) {
        const cursorDate = new Date(query.cursor);
        if (!Number.isNaN(cursorDate.getTime())) {
          conditions.push(lt(schema.interactions.lastMessageAt, cursorDate));
        }
      }

      const conversations = await db
        .select({
          id: schema.interactions.id,
          title: schema.interactions.title,
          source: schema.interactions.source,
          status: schema.inboxItems.status,
          projectId: schema.interactions.projectId,
          lastMessageAt: schema.interactions.lastMessageAt,
          createdAt: schema.interactions.createdAt,
        })
        .from(schema.inboxItems)
        .innerJoin(schema.interactions, eq(schema.inboxItems.interactionId, schema.interactions.id))
        .where(and(...conditions))
        .orderBy(desc(schema.interactions.lastMessageAt))
        .limit(query.limit);

      // Fetch last message preview for each conversation
      const conversationIds = conversations.map((c) => c.id);
      const lastMessages =
        conversationIds.length > 0
          ? await db
              .selectDistinctOn([schema.interactionMessages.interactionId], {
                interactionId: schema.interactionMessages.interactionId,
                text: schema.interactionMessages.text,
                senderType: schema.interactionMessages.senderType,
                createdAt: schema.interactionMessages.createdAt,
              })
              .from(schema.interactionMessages)
              .where(inArray(schema.interactionMessages.interactionId, conversationIds))
              .orderBy(
                schema.interactionMessages.interactionId,
                desc(schema.interactionMessages.createdAt),
              )
          : [];

      const lastMessageMap = new Map<
        string,
        { text: string; senderType: "user" | "agent"; createdAt: Date }
      >();
      for (const msg of lastMessages) {
        if (!lastMessageMap.has(msg.interactionId)) {
          lastMessageMap.set(msg.interactionId, {
            text: msg.text,
            senderType: msg.senderType,
            createdAt: msg.createdAt,
          });
        }
      }

      const firstUserMessages =
        conversationIds.length > 0
          ? await db
              .selectDistinctOn([schema.interactionMessages.interactionId], {
                interactionId: schema.interactionMessages.interactionId,
                senderEmail: schema.interactionMessages.senderEmail,
              })
              .from(schema.interactionMessages)
              .where(
                and(
                  inArray(schema.interactionMessages.interactionId, conversationIds),
                  eq(schema.interactionMessages.senderType, "user"),
                ),
              )
              .orderBy(
                schema.interactionMessages.interactionId,
                asc(schema.interactionMessages.createdAt),
              )
          : [];

      const participantEmailMap = new Map<string, string | null>();
      for (const msg of firstUserMessages) {
        participantEmailMap.set(msg.interactionId, msg.senderEmail);
      }

      return c.json(
        {
          conversations: conversations.map((conv) => ({
            ...conv,
            participantEmail: participantEmailMap.get(conv.id) ?? null,
            lastMessage: lastMessageMap.get(conv.id) ?? null,
          })),
        },
        200,
      );
    })
    .get("/:conversationId", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");

      const conversation = await canAccessInteraction(c.var.auth, conversationId);
      if (!conversation) {
        return notFoundResponse(c);
      }

      const messages = await db
        .select()
        .from(schema.interactionMessages)
        .where(eq(schema.interactionMessages.interactionId, conversationId))
        .orderBy(schema.interactionMessages.createdAt);

      return c.json({ conversation, messages }, 200);
    })
    .get("/:conversationId/messages", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");

      const conversation = await canAccessInteraction(c.var.auth, conversationId);
      if (!conversation) {
        return notFoundResponse(c);
      }

      const messages = await db
        .select()
        .from(schema.interactionMessages)
        .where(eq(schema.interactionMessages.interactionId, conversationId))
        .orderBy(desc(schema.interactionMessages.createdAt))
        .limit(50);

      return c.json({ messages: messages.reverse() }, 200);
    })
    .post(
      "/:conversationId/messages",
      validateConversationParams,
      bodyLimit({
        maxSize: maxMessageUploadBytes,
        onError: (c) => c.json({ error: "upload_too_large" }, 413),
      }),
      async (c) => {
        const { conversationId } = c.req.valid("param");
        const orgId = c.var.auth.activeOrganization.localOrganizationId;

        let conversation = await canAccessInteraction(c.var.auth, conversationId);
        if (!conversation) {
          return notFoundResponse(c);
        }

        const body = await c.req.parseBody({ all: true });
        const text = asString(body.text) ?? "";
        const files = asFiles(body.files);
        const normalizedProjectId = normalizeProjectId(asString(body.projectId));
        const requestedProjectId =
          typeof normalizedProjectId === "string" ? normalizedProjectId : undefined;

        if (!text.trim() && files.length === 0) {
          return badRequestResponse(c);
        }

        if (files.length > maxMessageUploadFiles) {
          return tooManyFilesResponse(c);
        }

        if (conversation.source !== "chat_ui") {
          return c.json({ error: "conversation_not_replyable" }, 400);
        }

        if (requestedProjectId && requestedProjectId !== conversation.projectId) {
          const project = await getOwnedProject(c.var.auth, requestedProjectId);
          if (!project) {
            return c.json({ error: "project_not_found" }, 400);
          }

          const [updatedConversation] = await db
            .update(schema.interactions)
            .set({ projectId: requestedProjectId, updatedAt: new Date() })
            .where(
              and(
                eq(schema.interactions.id, conversationId),
                eq(schema.interactions.organizationId, orgId),
              ),
            )
            .returning();

          if (updatedConversation) {
            conversation = { ...conversation, projectId: updatedConversation.projectId };
          }
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        const organizationSlug = c.var.auth.activeOrganization.slug ?? "";

        const uploadResults = await Promise.allSettled(
          files.map(async (file) =>
            createStoredFile({
              organizationId: orgId,
              projectId: conversation.projectId,
              createdByUserId: c.var.auth.user.localUserId,
              role: "source",
              sourceKind: "chat_upload",
              sourceInteractionId: conversationId,
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              content: await file.arrayBuffer(),
              metadata: {
                uploadSurface: "inbox_reply",
              },
              adapter,
            }),
          ),
        );
        const storedFiles = uploadResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        const failedUpload = uploadResults.find((result) => result.status === "rejected");

        if (failedUpload) {
          await cleanupStoredFiles(storedFiles, adapter);
          throw failedUpload.reason instanceof Error
            ? failedUpload.reason
            : new Error("failed to store uploaded file");
        }

        let message;
        try {
          message = await addInteractionMessage({
            interactionId: conversationId,
            senderType: "user",
            senderEmail: c.var.auth.user.email,
            text,
            attachments: storedFiles.map((file) => ({
              id: file.id,
              filename: file.filename,
              contentType: file.contentType,
              url: organizationSlug
                ? `/api/orgs/${organizationSlug}/files/${file.id}`
                : (file.downloadUrl ?? file.storageUrl),
            })),
          });
        } catch (error) {
          await cleanupStoredFiles(storedFiles, adapter);
          throw error;
        }

        // TODO: trigger agent response here

        return c.json({ message }, 201);
      },
    )
    .get("/:conversationId/jobs", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const conversation = await canAccessInteraction(c.var.auth, conversationId);
      if (!conversation) {
        return notFoundResponse(c);
      }

      const jobs = await db
        .select({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
          kind: schema.jobs.kind,
          type: schema.translationJobDetails.type,
          status: schema.jobs.status,
          outcomeKind: schema.translationJobDetails.outcomeKind,
          createdAt: schema.jobs.createdAt,
          completedAt: schema.jobs.completedAt,
        })
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(eq(schema.jobs.organizationId, orgId), eq(schema.jobs.interactionId, conversationId)),
        )
        .orderBy(desc(schema.jobs.createdAt));

      return c.json({ jobs }, 200);
    })
    .route("/:conversationId/chat", createChatStreamRoutes());
}
