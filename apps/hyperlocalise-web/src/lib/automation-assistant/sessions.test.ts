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
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";

import {
  AUTOMATION_ASSISTANT_HISTORY_MESSAGES,
  beginAutomationAssistantTurn,
  bindAutomationAssistantSession,
  createAutomationAssistantSession,
  deleteAutomationAssistantSession,
  endAutomationAssistantTurn,
  findAutomationAssistantSessionForAutomation,
  getAutomationAssistantSession,
  listAutomationAssistantMessages,
  loadAutomationAssistantModelMessages,
} from "./sessions";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function person() {
  const { user, organization } = await fixture.createLocalWorkosIdentity();
  return { userId: user.id, organizationId: organization.id };
}

async function automationFor(scope: { organizationId: string; userId: string }) {
  const [automation] = await db
    .insert(schema.workspaceAutomations)
    .values({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Weekly digest",
      instructions: "",
      triggerConfig: { mode: "manual" },
      toolConfig: {},
    })
    .returning({ id: schema.workspaceAutomations.id });
  return automation!.id;
}

describe("automation assistant sessions", () => {
  it("makes a session without an inbox item, kept for a day while unbound", async () => {
    const scope = await person();

    const session = await createAutomationAssistantSession({
      ...scope,
      firstMessageText: "Post a weekly summary to Slack",
    });

    expect(session).toMatchObject({ automationId: null, title: "Post a weekly summary to Slack" });
    const [row] = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.id, session.id));
    expect(row?.source).toBe("automation_assistant");
    expect(row?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    const inboxItems = await db
      .select()
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, session.id));
    expect(inboxItems).toEqual([]);
  });

  it("is read by its author only", async () => {
    const author = await person();
    const other = await person();
    const session = await createAutomationAssistantSession(author);

    expect(await getAutomationAssistantSession({ ...author, sessionId: session.id })).toMatchObject(
      {
        id: session.id,
      },
    );
    expect(
      await getAutomationAssistantSession({
        ...author,
        userId: other.userId,
        sessionId: session.id,
      }),
    ).toBeNull();
  });

  it("resumes the author's session for a saved automation, and binds a new one to it", async () => {
    const scope = await person();
    const automationId = await automationFor(scope);
    const unbound = await createAutomationAssistantSession(scope);

    expect(
      await findAutomationAssistantSessionForAutomation({ ...scope, automationId }),
    ).toBeNull();

    await bindAutomationAssistantSession({ sessionId: unbound.id, automationId });

    const found = await findAutomationAssistantSessionForAutomation({ ...scope, automationId });
    expect(found).toMatchObject({ id: unbound.id, automationId });
    const [row] = await db
      .select({ expiresAt: schema.interactions.expiresAt })
      .from(schema.interactions)
      .where(eq(schema.interactions.id, unbound.id));
    expect(row?.expiresAt).toBeNull();
  });

  it("goes with its automation when the automation is deleted", async () => {
    const scope = await person();
    const automationId = await automationFor(scope);
    const session = await createAutomationAssistantSession({ ...scope, automationId });

    await db
      .delete(schema.workspaceAutomations)
      .where(eq(schema.workspaceAutomations.id, automationId));

    expect(await getAutomationAssistantSession({ ...scope, sessionId: session.id })).toBeNull();
  });

  it("forgets an unbound session whose day is up, and drops it on the next creation", async () => {
    const scope = await person();
    const stale = await createAutomationAssistantSession(scope);
    await db
      .update(schema.interactions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.interactions.id, stale.id));

    expect(await getAutomationAssistantSession({ ...scope, sessionId: stale.id })).toBeNull();

    await createAutomationAssistantSession(scope);

    const rows = await db
      .select({ id: schema.interactions.id })
      .from(schema.interactions)
      .where(eq(schema.interactions.id, stale.id));
    expect(rows).toEqual([]);
  });

  it("runs one turn at a time, and takes over a turn that died", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);

    expect(await beginAutomationAssistantTurn(session.id)).toBe(true);
    expect(await beginAutomationAssistantTurn(session.id)).toBe(false);

    await endAutomationAssistantTurn(session.id);
    expect(await beginAutomationAssistantTurn(session.id)).toBe(true);

    await db
      .update(schema.interactions)
      .set({ assistantTurnStartedAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(schema.interactions.id, session.id));
    expect(await beginAutomationAssistantTurn(session.id)).toBe(true);
  });

  it("lists every message for the page and the newest fifty, oldest first, for the model", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);
    const start = Date.now() - 100_000;
    await db.insert(schema.interactionMessages).values(
      Array.from({ length: AUTOMATION_ASSISTANT_HISTORY_MESSAGES + 2 }, (_, index) => ({
        interactionId: session.id,
        senderType: index % 2 === 0 ? ("user" as const) : ("agent" as const),
        text: `message ${index}`,
        createdAt: new Date(start + index * 1000),
      })),
    );

    const listed = await listAutomationAssistantMessages(session.id);
    expect(listed).toHaveLength(AUTOMATION_ASSISTANT_HISTORY_MESSAGES + 2);
    expect(listed[0]).toMatchObject({
      sessionId: session.id,
      senderType: "user",
      text: "message 0",
    });

    const history = await loadAutomationAssistantModelMessages(session.id);
    expect(history).toHaveLength(AUTOMATION_ASSISTANT_HISTORY_MESSAGES);
    expect(history[0]).toEqual({ role: "user", content: "message 2" });
    expect(history.at(-1)).toEqual({
      role: "assistant",
      content: `message ${AUTOMATION_ASSISTANT_HISTORY_MESSAGES + 1}`,
    });
  });

  it("is deleted on start over", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);

    await deleteAutomationAssistantSession(session.id);

    expect(await getAutomationAssistantSession({ ...scope, sessionId: session.id })).toBeNull();
  });
});
