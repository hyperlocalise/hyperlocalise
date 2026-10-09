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
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";

import {
  describeAutomationSetupPageEdits,
  readAutomationSetupPageEdits,
  readAutomationSetupSnapshot,
  toAutomationSetupHistoryParts,
} from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { db, schema } from "@/lib/database/client";

/** How long a session bound to no automation is kept once its page is gone. */
export const AUTOMATION_ASSISTANT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** A turn older than this is taken for dead, so a crashed turn cannot block a session for good. */
export const AUTOMATION_ASSISTANT_TURN_STALE_MS = 10 * 60 * 1000;
/** How many of a session's messages a turn is given, newest first. */
export const AUTOMATION_ASSISTANT_HISTORY_MESSAGES = 50;
const TITLE_CHARS = 80;

export type AutomationAssistantSession = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  automationId: string | null;
  title: string;
  turnStartedAt: Date | null;
  createdAt: Date;
  lastMessageAt: Date;
};

export type AutomationAssistantMessage = {
  id: string;
  sessionId: string;
  senderType: "user" | "agent";
  text: string;
  parts: UIMessage["parts"] | null;
  createdAt: Date;
};

const sessions = schema.automationAssistantSessions;
const messages = schema.automationAssistantMessages;

function toSession(row: typeof sessions.$inferSelect): AutomationAssistantSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    createdByUserId: row.createdByUserId,
    automationId: row.automationId,
    title: row.title,
    turnStartedAt: row.turnStartedAt,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
  };
}

/** The author's own sessions only, and never one whose page is gone and whose time is up. */
function ownedBy(input: { organizationId: string; userId: string }) {
  return and(
    eq(sessions.organizationId, input.organizationId),
    eq(sessions.createdByUserId, input.userId),
    or(isNull(sessions.expiresAt), sql`${sessions.expiresAt} > now()`),
  )!;
}

/**
 * Makes a session for the person. One bound to an automation lives with it; one for a new
 * automation is kept for a day, so a turn still running when its page is left can finish. The
 * person's own sessions whose day is up are deleted first, so nothing sweeps them later.
 */
export async function createAutomationAssistantSession(input: {
  organizationId: string;
  userId: string;
  automationId?: string | null;
  firstMessageText?: string;
}): Promise<AutomationAssistantSession> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.createdByUserId, input.userId), lt(sessions.expiresAt, new Date())));
  const now = new Date();
  const [row] = await db
    .insert(sessions)
    .values({
      organizationId: input.organizationId,
      title: (input.firstMessageText?.trim() || "Automation assistant").slice(0, TITLE_CHARS),
      createdByUserId: input.userId,
      automationId: input.automationId ?? null,
      expiresAt: input.automationId
        ? null
        : new Date(now.getTime() + AUTOMATION_ASSISTANT_SESSION_TTL_MS),
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) {
    throw new Error("The automation assistant session could not be created.");
  }
  return toSession(row);
}

export async function getAutomationAssistantSession(input: {
  organizationId: string;
  userId: string;
  sessionId: string;
}): Promise<AutomationAssistantSession | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, input.sessionId), ownedBy(input)))
    .limit(1);
  return row ? toSession(row) : null;
}

/** The person's newest session about a saved automation, which its page resumes. */
export async function findAutomationAssistantSessionForAutomation(input: {
  organizationId: string;
  userId: string;
  automationId: string;
}): Promise<AutomationAssistantSession | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.automationId, input.automationId), ownedBy(input)))
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  return row ? toSession(row) : null;
}

/** Ties a session for a new automation to the automation it was saved as. */
export async function bindAutomationAssistantSession(input: {
  sessionId: string;
  automationId: string;
}): Promise<void> {
  await db
    .update(sessions)
    .set({ automationId: input.automationId, expiresAt: null, updatedAt: new Date() })
    .where(eq(sessions.id, input.sessionId));
}

export async function deleteAutomationAssistantSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Claims the session for one turn. False when another turn is running, so the caller answers
 * 409. A claim older than the stale limit is taken over, since its turn can no longer be alive.
 */
export async function beginAutomationAssistantTurn(sessionId: string): Promise<boolean> {
  const stale = new Date(Date.now() - AUTOMATION_ASSISTANT_TURN_STALE_MS);
  const claimed = await db
    .update(sessions)
    .set({ turnStartedAt: new Date() })
    .where(
      and(
        eq(sessions.id, sessionId),
        or(isNull(sessions.turnStartedAt), lt(sessions.turnStartedAt, stale)),
      ),
    )
    .returning({ id: sessions.id });
  return claimed.length === 1;
}

export async function endAutomationAssistantTurn(sessionId: string): Promise<void> {
  await db.update(sessions).set({ turnStartedAt: null }).where(eq(sessions.id, sessionId));
}

function toMessage(row: typeof messages.$inferSelect): AutomationAssistantMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    senderType: row.senderType,
    text: row.text,
    parts: row.parts ?? null,
    createdAt: row.createdAt,
  };
}

/** Saves one message of the session and moves the session's last-message time on. */
export async function addAutomationAssistantMessage(input: {
  sessionId: string;
  senderType: AutomationAssistantMessage["senderType"];
  text: string;
  parts?: UIMessage["parts"] | null;
}): Promise<void> {
  const now = new Date();
  await db.insert(messages).values({
    sessionId: input.sessionId,
    senderType: input.senderType,
    text: input.text,
    parts: input.parts ?? null,
    createdAt: now,
  });
  await db
    .update(sessions)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(sessions.id, input.sessionId));
}

/** How many of the newest replies are searched for the form the last turn left. */
const SNAPSHOT_LOOKBACK_REPLIES = 5;

/**
 * The form as the assistant's last finished turn left it, or null when no turn has recorded one.
 * The next turn compares it with the page it is sent from, to learn what the person changed
 * themselves in between.
 */
export async function findAutomationAssistantFormAfterLastTurn(
  sessionId: string,
): Promise<WorkspaceAutomationFormState | null> {
  const rows = await db
    .select({ parts: messages.parts })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.senderType, "agent")))
    .orderBy(desc(messages.createdAt))
    .limit(SNAPSHOT_LOOKBACK_REPLIES);
  for (const row of rows) {
    const form = readAutomationSetupSnapshot(row.parts);
    if (form) {
      return form;
    }
  }
  return null;
}

/** Every message of the session, oldest first, for the panel. */
export async function listAutomationAssistantMessages(
  sessionId: string,
): Promise<AutomationAssistantMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt);
  return rows.map(toMessage);
}

/**
 * The newest messages of the session as the model sees them, oldest first: what was said, each
 * finished call of the setup tool with what it did, and what the person changed on the page
 * themselves between turns. A reply that made no call shows none, so the model can tell a change
 * that was made from one that was only described.
 */
export async function loadAutomationAssistantModelMessages(
  sessionId: string,
): Promise<ModelMessage[]> {
  const rows = await db
    .select({
      senderType: messages.senderType,
      text: messages.text,
      parts: messages.parts,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(AUTOMATION_ASSISTANT_HISTORY_MESSAGES);

  const history = rows.toReversed().flatMap((row): Array<Omit<UIMessage, "id">> => {
    if (row.senderType === "user") {
      if (!row.text.trim()) {
        return [];
      }
      // What the person changed on the page before sending this is part of what happened, and
      // stays true, so the model is shown it with the message every time.
      const edits = readAutomationSetupPageEdits(row.parts);
      const text =
        edits.length > 0 ? `${describeAutomationSetupPageEdits(edits)}\n\n${row.text}` : row.text;
      return [{ role: "user", parts: [{ type: "text", text }] }];
    }
    const parts = toAutomationSetupHistoryParts(
      row.parts ?? [{ type: "text", text: row.text }],
    ) as UIMessage["parts"];
    return parts.some((part) => part.type !== "step-start") ? [{ role: "assistant", parts }] : [];
  });
  // A call left unfinished has no result to pair it with, and a provider refuses one without.
  return convertToModelMessages(history, { ignoreIncompleteToolCalls: true });
}
