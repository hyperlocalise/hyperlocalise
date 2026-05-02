import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

type CreateInteractionInput = {
  organizationId: string;
  source: "chat_ui" | "email_agent" | "github_agent";
  title: string;
  projectId?: string;
  sourceThreadId?: string;
};

export async function createInteraction(input: CreateInteractionInput) {
  const now = new Date();
  const [interaction] = await db
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
  await db.insert(schema.inboxItems).values({
    interactionId: interaction.id,
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return interaction;
}

type AddMessageInput = {
  interactionId: string;
  senderType: "user" | "agent";
  text: string;
  senderEmail?: string;
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
  source: "chat_ui" | "email_agent" | "github_agent";
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
