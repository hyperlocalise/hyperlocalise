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
  addAutomationAssistantMessage,
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
  it("makes a session that is no conversation, kept for a day while unbound", async () => {
    const scope = await person();

    const session = await createAutomationAssistantSession({
      ...scope,
      firstMessageText: "Post a weekly summary to Slack",
    });

    expect(session).toMatchObject({ automationId: null, title: "Post a weekly summary to Slack" });
    const [row] = await db
      .select()
      .from(schema.automationAssistantSessions)
      .where(eq(schema.automationAssistantSessions.id, session.id));
    expect(row?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    const conversations = await db
      .select({ id: schema.interactions.id })
      .from(schema.interactions)
      .where(eq(schema.interactions.organizationId, scope.organizationId));
    expect(conversations).toEqual([]);
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
      .select({ expiresAt: schema.automationAssistantSessions.expiresAt })
      .from(schema.automationAssistantSessions)
      .where(eq(schema.automationAssistantSessions.id, unbound.id));
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
      .update(schema.automationAssistantSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.automationAssistantSessions.id, stale.id));

    expect(await getAutomationAssistantSession({ ...scope, sessionId: stale.id })).toBeNull();

    await createAutomationAssistantSession(scope);

    const rows = await db
      .select({ id: schema.automationAssistantSessions.id })
      .from(schema.automationAssistantSessions)
      .where(eq(schema.automationAssistantSessions.id, stale.id));
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
      .update(schema.automationAssistantSessions)
      .set({ turnStartedAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(eq(schema.automationAssistantSessions.id, session.id));
    expect(await beginAutomationAssistantTurn(session.id)).toBe(true);
  });

  it("saves a message with its parts and moves the session's last-message time on", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);
    await db
      .update(schema.automationAssistantSessions)
      .set({ lastMessageAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.automationAssistantSessions.id, session.id));

    await addAutomationAssistantMessage({
      sessionId: session.id,
      senderType: "agent",
      text: "Done.",
      parts: [{ type: "text", text: "Done." }],
    });

    expect(await listAutomationAssistantMessages(session.id)).toMatchObject([
      { senderType: "agent", text: "Done.", parts: [{ type: "text", text: "Done." }] },
    ]);
    const after = await getAutomationAssistantSession({ ...scope, sessionId: session.id });
    expect(after!.lastMessageAt.getTime()).toBeGreaterThan(Date.now() - 30_000);
  });

  it("lists every message for the page and the newest fifty, oldest first, for the model", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);
    const start = Date.now() - 100_000;
    await db.insert(schema.automationAssistantMessages).values(
      Array.from({ length: AUTOMATION_ASSISTANT_HISTORY_MESSAGES + 2 }, (_, index) => ({
        sessionId: session.id,
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
    expect(history[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "message 2" }],
    });
    expect(history.at(-1)).toMatchObject({
      role: "assistant",
      // These replies called no tool, so each ends with the page's record that nothing changed.
      content: [
        { type: "text", text: `message ${AUTOMATION_ASSISTANT_HISTORY_MESSAGES + 1}` },
        { type: "text", text: expect.stringContaining("Page record") },
      ],
    });
  });

  it("shows the model each past call of the setup tool with what it did, and no call for a reply that only said so", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);
    const start = Date.now() - 100_000;
    const call = (toolCallId: string, state: string, output?: unknown) => ({
      type: "tool-update_automation_setup",
      toolCallId,
      state,
      input: { name: "Competitor watch" },
      ...(output === undefined ? {} : { output }),
    });
    const turns = [
      { senderType: "user" as const, text: "Rename it to Competitor watch", parts: null },
      {
        senderType: "agent" as const,
        text: "I've renamed it.",
        parts: [
          { type: "step-start" },
          { type: "reasoning", text: "They want a new name." },
          call("call_1", "output-available", {
            applied: true,
            editorSessionId: "editor-1",
            proposal: { name: "Competitor watch" },
            changes: [{ kind: "name", name: "Competitor watch" }],
            result: {
              changed: true,
              applied: ['The name is now "Competitor watch".'],
              notAdded: [],
              skills: [{ id: "research-web", name: "Research the web" }],
              stillNeeded: ["Choose a Hyperlocalise project."],
            },
          }),
          { type: "step-start" },
          { type: "text", text: "I've renamed it." },
        ],
      },
      { senderType: "user" as const, text: "Rename it to Competitor watch", parts: null },
      {
        senderType: "agent" as const,
        text: "I've renamed it.",
        parts: [
          { type: "step-start" },
          // A call the turn never finished has no result, so it is not shown at all.
          call("call_2", "input-available"),
          { type: "text", text: "I've renamed it." },
        ],
      },
    ];
    await db.insert(schema.automationAssistantMessages).values(
      turns.map((turn, index) => ({
        sessionId: session.id,
        senderType: turn.senderType,
        text: turn.text,
        parts: turn.parts as never,
        createdAt: new Date(start + index * 1000),
      })),
    );

    const history = await loadAutomationAssistantModelMessages(session.id);

    expect(history.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(history[1]).toMatchObject({
      content: [
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "update_automation_setup",
          input: { name: "Competitor watch" },
        },
      ],
    });
    expect(history[2]).toMatchObject({
      content: [
        {
          type: "tool-result",
          toolCallId: "call_1",
          output: {
            type: "json",
            value: {
              changed: true,
              applied: ['The name is now "Competitor watch".'],
              notAdded: [],
            },
          },
        },
      ],
    });
    // The page as it then was is left out: the prompt's page section says what it holds now.
    const shown = JSON.stringify(history);
    expect(shown).not.toContain("stillNeeded");
    expect(shown).not.toContain("proposal");
    expect(shown).not.toContain("They want a new name.");
    // The second reply said the same words and made no call. The model sees that, and the page's
    // record that nothing changed, so the reply is not taken at its word.
    expect(history[5]).toMatchObject({
      content: [
        { type: "text", text: "I've renamed it." },
        { type: "text", text: expect.stringContaining("this turn made no change to the setup") },
      ],
    });
    // A turn that did change the setup carries no such record.
    expect(JSON.stringify(history.slice(0, 4))).not.toContain("Page record");
    expect(shown).not.toContain("call_2");
  });

  it("is deleted on start over", async () => {
    const scope = await person();
    const session = await createAutomationAssistantSession(scope);

    await deleteAutomationAssistantSession(session.id);

    expect(await getAutomationAssistantSession({ ...scope, sessionId: session.id })).toBeNull();
  });
});
