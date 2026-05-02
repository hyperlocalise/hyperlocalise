import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

type CreateConversationInput = {
  organizationId: string;
  source: "chat_ui" | "email_agent" | "github_agent";
  title: string;
  projectId?: string;
  sourceThreadId?: string;
};

export async function createConversation(input: CreateConversationInput) {
  const now = new Date();
  const [conversation] = await db
    .insert(schema.conversations)
    .values({
      organizationId: input.organizationId,
      source: input.source,
      title: input.title,
      projectId: input.projectId ?? null,
      sourceThreadId: input.sourceThreadId ?? null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return conversation;
}

type AddMessageInput = {
  conversationId: string;
  senderType: "user" | "agent";
  text: string;
  senderEmail?: string;
  attachments?: Array<{ id: string; filename: string; contentType: string; url: string }>;
};

export async function addConversationMessage(input: AddMessageInput) {
  const now = new Date();
  const [message] = await db
    .insert(schema.conversationMessages)
    .values({
      conversationId: input.conversationId,
      senderType: input.senderType,
      text: input.text,
      senderEmail: input.senderEmail ?? null,
      attachments: input.attachments ?? null,
      createdAt: now,
    })
    .returning();

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(schema.conversations.id, input.conversationId));

  return message;
}

export async function linkJobToConversation(jobId: string, conversationId: string) {
  await db.update(schema.jobs).set({ conversationId }).where(eq(schema.jobs.id, jobId));
}

export async function findConversationBySourceThreadId(sourceThreadId: string) {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.sourceThreadId, sourceThreadId))
    .limit(1);

  return conversation ?? null;
}
