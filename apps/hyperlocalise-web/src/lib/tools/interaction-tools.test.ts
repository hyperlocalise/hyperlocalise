import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { createResolveInteractionTool } from "./interaction-tools";

const createdWorkosOrganizationIds = new Set<string>();

async function createOrganization() {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;
  createdWorkosOrganizationIds.add(workosOrganizationId);

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    })
    .returning();

  return organization;
}

async function createInteractionWithInboxItem(organizationId: string) {
  const [interaction] = await db
    .insert(schema.interactions)
    .values({
      organizationId,
      source: "chat_ui",
      title: "Test conversation",
    })
    .returning();

  await db.insert(schema.inboxItems).values({
    interactionId: interaction.id,
    organizationId,
    status: "active",
  });

  return interaction;
}

async function executeResolveInteractionTool(input: {
  conversationId: string;
  organizationId: string;
}) {
  const resolveInteraction = createResolveInteractionTool({
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    localUserId: "user_test",
    membershipRole: "admin",
    projectId: null,
    db,
  });

  if (!resolveInteraction.execute) {
    throw new Error("resolve interaction tool is missing execute");
  }

  return resolveInteraction.execute(
    { status: "archived" },
    { toolCallId: "test-tool-call", messages: [] },
  );
}

afterEach(async () => {
  for (const workosOrganizationId of createdWorkosOrganizationIds) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
  }

  createdWorkosOrganizationIds.clear();
});

describe("createResolveInteractionTool", () => {
  it("updates the current interaction inbox item status", async () => {
    const organization = await createOrganization();
    const interaction = await createInteractionWithInboxItem(organization.id);

    const result = await executeResolveInteractionTool({
      conversationId: interaction.id,
      organizationId: organization.id,
    });

    expect(result).toEqual({ success: true, status: "archived" });

    const [item] = await db
      .select({ status: schema.inboxItems.status })
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, interaction.id))
      .limit(1);

    expect(item?.status).toBe("archived");
  });

  it("returns failure when the current interaction has no inbox item", async () => {
    const organization = await createOrganization();

    const result = await executeResolveInteractionTool({
      conversationId: randomUUID(),
      organizationId: organization.id,
    });

    expect(result).toEqual({ success: false, status: null, error: "Inbox item not found." });
  });

  it("does not update an inbox item from another organization", async () => {
    const owningOrganization = await createOrganization();
    const otherOrganization = await createOrganization();
    const interaction = await createInteractionWithInboxItem(owningOrganization.id);

    const result = await executeResolveInteractionTool({
      conversationId: interaction.id,
      organizationId: otherOrganization.id,
    });

    expect(result).toEqual({ success: false, status: null, error: "Inbox item not found." });

    const [item] = await db
      .select({ status: schema.inboxItems.status })
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, interaction.id))
      .limit(1);

    expect(item?.status).toBe("active");
  });
});
