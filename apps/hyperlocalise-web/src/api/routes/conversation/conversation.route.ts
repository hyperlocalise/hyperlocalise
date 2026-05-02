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
  status: z.enum(["active", "archived"]).optional(),
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

      const conditions = [eq(schema.inboxItems.organizationId, orgId)];
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
        .select({
          id: schema.interactions.id,
          organizationId: schema.interactions.organizationId,
          projectId: schema.interactions.projectId,
          source: schema.interactions.source,
          title: schema.interactions.title,
          sourceThreadId: schema.interactions.sourceThreadId,
          lastMessageAt: schema.interactions.lastMessageAt,
          createdAt: schema.interactions.createdAt,
          updatedAt: schema.interactions.updatedAt,
          status: schema.inboxItems.status,
        })
        .from(schema.interactions)
        .innerJoin(schema.inboxItems, eq(schema.inboxItems.interactionId, schema.interactions.id))
        .where(
          and(
            eq(schema.interactions.id, conversationId),
            eq(schema.interactions.organizationId, orgId),
          ),
        )
        .limit(1);

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
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const [conversation] = await db
        .select({ id: schema.interactions.id })
        .from(schema.interactions)
        .where(
          and(
            eq(schema.interactions.id, conversationId),
            eq(schema.interactions.organizationId, orgId),
          ),
        )
        .limit(1);

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
      validatePostMessageBody,
      async (c) => {
        const { conversationId } = c.req.valid("param");
        const body = c.req.valid("json");
        const orgId = c.var.auth.activeOrganization.localOrganizationId;

        const [conversation] = await db
          .select({ id: schema.interactions.id, source: schema.interactions.source })
          .from(schema.interactions)
          .where(
            and(
              eq(schema.interactions.id, conversationId),
              eq(schema.interactions.organizationId, orgId),
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
          .insert(schema.interactionMessages)
          .values({
            interactionId: conversationId,
            senderType: "user",
            text: body.text,
            createdAt: now,
          })
          .returning();

        await db
          .update(schema.interactions)
          .set({ lastMessageAt: now, updatedAt: now })
          .where(eq(schema.interactions.id, conversationId));

        await db
          .update(schema.inboxItems)
          .set({ updatedAt: now })
          .where(eq(schema.inboxItems.interactionId, conversationId));

        // TODO: trigger agent response here

        return c.json({ message }, 201);
      },
    )
    .get("/:conversationId/jobs", validateConversationParams, async (c) => {
      const { conversationId } = c.req.valid("param");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const [conversation] = await db
        .select({ id: schema.interactions.id })
        .from(schema.interactions)
        .where(
          and(
            eq(schema.interactions.id, conversationId),
            eq(schema.interactions.organizationId, orgId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return notFoundResponse(c);
      }

      const jobs = await db
        .select({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
          type: schema.translationJobDetails.type,
          status: schema.jobs.status,
          outcomeKind: schema.translationJobDetails.outcomeKind,
          createdAt: schema.jobs.createdAt,
          completedAt: schema.jobs.completedAt,
        })
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(
            eq(schema.jobs.kind, "translation"),
            eq(schema.jobs.organizationId, orgId),
            eq(schema.jobs.interactionId, conversationId),
          ),
        )
        .orderBy(desc(schema.jobs.createdAt));

      return c.json({ jobs }, 200);
    });
}
