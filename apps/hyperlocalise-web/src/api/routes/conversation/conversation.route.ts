import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

const conversationIdParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

const postMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(10000),
});

const listConversationsQuerySchema = z.object({
  status: z.enum(["active", "archived", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

function notFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "not_found" }, 404);
}

const validateConversationParams = validator("param", (value, c) => {
  const parsed = conversationIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c);
  }
  return parsed.data;
});

const validatePostMessageBody = validator("json", (value, c) => {
  const parsed = postMessageBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_message_payload" }, 400);
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

export function createConversationRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListQuery, async (c) => {
      const query = c.req.valid("query");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const conditions = [eq(schema.conversations.organizationId, orgId)];
      if (query.status) {
        conditions.push(eq(schema.conversations.status, query.status));
      }
      if (query.cursor) {
        const cursorDate = new Date(query.cursor);
        if (!Number.isNaN(cursorDate.getTime())) {
          conditions.push(lt(schema.conversations.lastMessageAt, cursorDate));
        }
      }

      const conversations = await db
        .select({
          id: schema.conversations.id,
          title: schema.conversations.title,
          source: schema.conversations.source,
          status: schema.conversations.status,
          projectId: schema.conversations.projectId,
          lastMessageAt: schema.conversations.lastMessageAt,
          createdAt: schema.conversations.createdAt,
        })
        .from(schema.conversations)
        .where(and(...conditions))
        .orderBy(desc(schema.conversations.lastMessageAt))
        .limit(query.limit);

      // Fetch last message preview for each conversation
      const conversationIds = conversations.map((c) => c.id);
      const lastMessages =
        conversationIds.length > 0
          ? await db
              .selectDistinctOn([schema.conversationMessages.conversationId], {
                conversationId: schema.conversationMessages.conversationId,
                text: schema.conversationMessages.text,
                senderType: schema.conversationMessages.senderType,
                createdAt: schema.conversationMessages.createdAt,
              })
              .from(schema.conversationMessages)
              .where(inArray(schema.conversationMessages.conversationId, conversationIds))
              .orderBy(
                schema.conversationMessages.conversationId,
                desc(schema.conversationMessages.createdAt),
              )
          : [];

      const lastMessageMap = new Map<
        string,
        { text: string; senderType: "user" | "agent"; createdAt: Date }
      >();
      for (const msg of lastMessages) {
        if (!lastMessageMap.has(msg.conversationId)) {
          lastMessageMap.set(msg.conversationId, {
            text: msg.text,
            senderType: msg.senderType,
            createdAt: msg.createdAt,
          });
        }
      }

      return c.json(
        {
          conversations: conversations.map((conv) => ({
            ...conv,
            lastMessage: lastMessageMap.get(conv.id) ?? null,
          })),
        },
        200,
      );
    })
    .get("/:conversationId", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const [conversation] = await db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.organizationId, orgId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return notFoundResponse(c);
      }

      const messages = await db
        .select()
        .from(schema.conversationMessages)
        .where(eq(schema.conversationMessages.conversationId, conversationId))
        .orderBy(schema.conversationMessages.createdAt);

      return c.json({ conversation, messages }, 200);
    })
    .get("/:conversationId/messages", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const [conversation] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.organizationId, orgId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return notFoundResponse(c);
      }

      const messages = await db
        .select()
        .from(schema.conversationMessages)
        .where(eq(schema.conversationMessages.conversationId, conversationId))
        .orderBy(desc(schema.conversationMessages.createdAt))
        .limit(50);

      return c.json({ messages: messages.reverse() }, 200);
    })
    .post(
      "/:conversationId/messages",
      validateConversationParams,
      validatePostMessageBody,
      async (c) => {
        const { conversationId } = c.req.valid("param");
        const body = c.req.valid("json");
        const orgId = c.var.auth.activeOrganization.localOrganizationId;

        const [conversation] = await db
          .select({ id: schema.conversations.id, source: schema.conversations.source })
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.id, conversationId),
              eq(schema.conversations.organizationId, orgId),
            ),
          )
          .limit(1);

        if (!conversation) {
          return notFoundResponse(c);
        }

        if (conversation.source !== "chat_ui") {
          return c.json({ error: "conversation_not_replyable" }, 400);
        }

        const now = new Date();
        const [message] = await db
          .insert(schema.conversationMessages)
          .values({
            conversationId,
            senderType: "user",
            text: body.text,
            createdAt: now,
          })
          .returning();

        await db
          .update(schema.conversations)
          .set({ lastMessageAt: now, updatedAt: now })
          .where(eq(schema.conversations.id, conversationId));

        // TODO: trigger agent response here

        return c.json({ message }, 201);
      },
    )
    .get("/:conversationId/jobs", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const [conversation] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.organizationId, orgId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return notFoundResponse(c);
      }

      const jobs = await db
        .select({
          id: schema.translationJobs.id,
          projectId: schema.translationJobs.projectId,
          type: schema.translationJobs.type,
          status: schema.translationJobs.status,
          outcomeKind: schema.translationJobs.outcomeKind,
          createdAt: schema.translationJobs.createdAt,
          completedAt: schema.translationJobs.completedAt,
        })
        .from(schema.translationJobs)
        .where(eq(schema.translationJobs.conversationId, conversationId))
        .orderBy(desc(schema.translationJobs.createdAt));

      return c.json({ jobs }, 200);
    });
}
