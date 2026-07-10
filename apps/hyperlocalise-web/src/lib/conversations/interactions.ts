import { and, eq } from "drizzle-orm";
import type { UIMessage } from "ai";

import { db, schema } from "@/lib/database";

const sourceFileIdPattern = /\bsourceFileId=/;

type CreateInteractionInput = {
  organizationId: string;
  source: "chat_ui" | "email_agent" | "github_agent" | "slack_agent";
  title: string;
  projectId?: string;
  sourceThreadId?: string;
};

export async function createInteraction(input: CreateInteractionInput) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [interaction] = await tx
      .insert(schema.interactions)
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

    // Every interaction creates exactly one inbox item.
    await tx.insert(schema.inboxItems).values({
      interactionId: interaction.id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return interaction;
  });
}

type AddMessageInput = {
  interactionId: string;
  senderType: "user" | "agent";
  text: string;
  senderEmail?: string;
  parts?: UIMessage["parts"] | null;
  attachments?: Array<{ id: string; filename: string; contentType: string; url: string }>;
};

export async function addInteractionMessage(input: AddMessageInput) {
  const now = new Date();
  const [message] = await db
    .insert(schema.interactionMessages)
    .values({
      interactionId: input.interactionId,
      senderType: input.senderType,
      text: input.text,
      senderEmail: input.senderEmail ?? null,
      parts: input.parts ?? null,
      attachments: input.attachments ?? null,
      createdAt: now,
    })
    .returning();

  await db
    .update(schema.interactions)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(schema.interactions.id, input.interactionId));

  await db
    .update(schema.inboxItems)
    .set({ updatedAt: now })
    .where(eq(schema.inboxItems.interactionId, input.interactionId));

  return message;
}

export async function interactionHasTranslationAttachments(interactionId: string) {
  const messages = await db
    .select({
      text: schema.interactionMessages.text,
      attachments: schema.interactionMessages.attachments,
    })
    .from(schema.interactionMessages)
    .where(eq(schema.interactionMessages.interactionId, interactionId));

  return messages.some((message) => {
    if (sourceFileIdPattern.test(message.text)) {
      return true;
    }

    const attachments = message.attachments;
    return Array.isArray(attachments) && attachments.length > 0;
  });
}

export async function updateInteractionMessage(
  messageId: string,
  input: Partial<Pick<AddMessageInput, "text" | "senderEmail" | "attachments">>,
) {
  const [message] = await db
    .update(schema.interactionMessages)
    .set({
      text: input.text,
      senderEmail: input.senderEmail,
      attachments: input.attachments,
    })
    .where(eq(schema.interactionMessages.id, messageId))
    .returning();

  return message;
}

export async function linkJobToInteraction(input: {
  organizationId: string;
  jobId: string;
  interactionId: string;
}) {
  const [interaction] = await db
    .select({ organizationId: schema.interactions.organizationId })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.id, input.interactionId),
        eq(schema.interactions.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!interaction) {
    return;
  }

  await db
    .update(schema.jobs)
    .set({ interactionId: input.interactionId })
    .where(
      and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.organizationId, input.organizationId)),
    );
}

export async function findInteractionBySourceThreadId(input: {
  organizationId: string;
  source: "chat_ui" | "email_agent" | "github_agent" | "slack_agent";
  sourceThreadId: string;
}) {
  const [interaction] = await db
    .select()
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.organizationId, input.organizationId),
        eq(schema.interactions.source, input.source),
        eq(schema.interactions.sourceThreadId, input.sourceThreadId),
      ),
    )
    .limit(1);

  return interaction ?? null;
}
