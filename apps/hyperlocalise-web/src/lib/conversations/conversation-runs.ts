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
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { UIMessage } from "ai";

import { db, schema } from "@/lib/database/client";
import type { ConversationRunStatus } from "@/lib/database/schema";

/** A running turn whose heartbeat is older than this has lost its process. */
export const CONVERSATION_RUN_STALE_AFTER_MS = 60_000;

export type ConversationRunRecord = {
  id: string;
  interactionId: string;
  userMessageId: string;
  status: ConversationRunStatus;
  snapshotParts: UIMessage["parts"] | null;
  agentMessageId: string | null;
  cancelRequestedAt: Date | null;
  heartbeatAt: Date;
  updatedAt: Date;
};

export type ClaimConversationRunResult =
  | { kind: "claimed"; runId: string }
  | { kind: "in_progress"; run: ConversationRunRecord }
  | { kind: "already_processed"; run: ConversationRunRecord };

const runColumns = {
  id: schema.conversationRuns.id,
  interactionId: schema.conversationRuns.interactionId,
  userMessageId: schema.conversationRuns.userMessageId,
  status: schema.conversationRuns.status,
  snapshotParts: schema.conversationRuns.snapshotParts,
  agentMessageId: schema.conversationRuns.agentMessageId,
  cancelRequestedAt: schema.conversationRuns.cancelRequestedAt,
  heartbeatAt: schema.conversationRuns.heartbeatAt,
  updatedAt: schema.conversationRuns.updatedAt,
};

export function isConversationRunStale(
  run: Pick<ConversationRunRecord, "status" | "heartbeatAt">,
  now = new Date(),
) {
  return (
    run.status === "running" &&
    now.getTime() - run.heartbeatAt.getTime() > CONVERSATION_RUN_STALE_AFTER_MS
  );
}

/**
 * Starts the turn that answers `userMessageId`, at most once. A second caller sees the turn in
 * progress or already answered. A failed turn, or one whose process died, is claimed again so the
 * user can retry it.
 */
export async function claimConversationRun(input: {
  interactionId: string;
  organizationId: string;
  userMessageId: string;
  now?: Date;
}): Promise<ClaimConversationRunResult> {
  const now = input.now ?? new Date();
  const [inserted] = await db
    .insert(schema.conversationRuns)
    .values({
      interactionId: input.interactionId,
      organizationId: input.organizationId,
      userMessageId: input.userMessageId,
      status: "running",
      heartbeatAt: now,
    })
    .onConflictDoNothing({ target: schema.conversationRuns.userMessageId })
    .returning({ id: schema.conversationRuns.id });

  if (inserted) {
    return { kind: "claimed", runId: inserted.id };
  }

  const staleBefore = new Date(now.getTime() - CONVERSATION_RUN_STALE_AFTER_MS);
  const [reclaimed] = await db
    .update(schema.conversationRuns)
    .set({
      status: "running",
      snapshotParts: null,
      agentMessageId: null,
      cancelRequestedAt: null,
      heartbeatAt: now,
    })
    .where(
      and(
        eq(schema.conversationRuns.userMessageId, input.userMessageId),
        eq(schema.conversationRuns.interactionId, input.interactionId),
        or(
          eq(schema.conversationRuns.status, "failed"),
          and(
            eq(schema.conversationRuns.status, "running"),
            lt(schema.conversationRuns.heartbeatAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({ id: schema.conversationRuns.id });

  if (reclaimed) {
    return { kind: "claimed", runId: reclaimed.id };
  }

  const [existing] = await db
    .select(runColumns)
    .from(schema.conversationRuns)
    .where(eq(schema.conversationRuns.userMessageId, input.userMessageId))
    .limit(1);

  if (!existing || existing.interactionId !== input.interactionId) {
    // The row vanished between statements (conversation deleted) or belongs elsewhere.
    throw new Error("conversation run claim conflict");
  }

  return existing.status === "running"
    ? { kind: "in_progress", run: existing }
    : { kind: "already_processed", run: existing };
}

/**
 * Saves the reply so far and proves the process is alive. Returns whether someone asked to stop
 * the turn, so the caller can abort it.
 */
export async function saveConversationRunSnapshot(input: {
  runId: string;
  parts: UIMessage["parts"] | null;
}): Promise<{ cancelRequested: boolean }> {
  const [row] = await db
    .update(schema.conversationRuns)
    .set({
      ...(input.parts ? { snapshotParts: input.parts } : {}),
      heartbeatAt: new Date(),
    })
    .where(
      and(
        eq(schema.conversationRuns.id, input.runId),
        eq(schema.conversationRuns.status, "running"),
      ),
    )
    .returning({ cancelRequestedAt: schema.conversationRuns.cancelRequestedAt });

  return { cancelRequested: Boolean(row?.cancelRequestedAt) };
}

export async function finishConversationRun(input: {
  runId: string;
  status: Exclude<ConversationRunStatus, "running">;
  agentMessageId: string | null;
}) {
  await db
    .update(schema.conversationRuns)
    .set({
      status: input.status,
      agentMessageId: input.agentMessageId,
      // The persisted message is the source of truth once it exists.
      ...(input.agentMessageId ? { snapshotParts: null } : {}),
      heartbeatAt: new Date(),
    })
    .where(
      and(
        eq(schema.conversationRuns.id, input.runId),
        eq(schema.conversationRuns.status, "running"),
      ),
    );
}

/** Asks the running turn of a conversation to stop. Returns the run, or null when none runs. */
export async function requestConversationRunCancel(interactionId: string) {
  const [row] = await db
    .update(schema.conversationRuns)
    .set({ cancelRequestedAt: new Date() })
    .where(
      and(
        eq(schema.conversationRuns.interactionId, interactionId),
        eq(schema.conversationRuns.status, "running"),
        isNull(schema.conversationRuns.cancelRequestedAt),
      ),
    )
    .returning({ id: schema.conversationRuns.id, status: schema.conversationRuns.status });

  if (row) {
    return row;
  }

  const [alreadyRequested] = await db
    .select({ id: schema.conversationRuns.id, status: schema.conversationRuns.status })
    .from(schema.conversationRuns)
    .where(
      and(
        eq(schema.conversationRuns.interactionId, interactionId),
        eq(schema.conversationRuns.status, "running"),
      ),
    )
    .limit(1);
  return alreadyRequested ?? null;
}

export async function getLatestConversationRun(
  interactionId: string,
): Promise<ConversationRunRecord | null> {
  const [row] = await db
    .select(runColumns)
    .from(schema.conversationRuns)
    .where(eq(schema.conversationRuns.interactionId, interactionId))
    .orderBy(desc(schema.conversationRuns.createdAt))
    .limit(1);
  return row ?? null;
}

/** Full tool results for messages whose parts hold shortened copies. */
export async function saveInteractionMessageToolOutputs(input: {
  messageId: string;
  outputs: ReadonlyMap<string, unknown>;
}) {
  if (input.outputs.size === 0) {
    return;
  }

  await db
    .insert(schema.interactionMessageToolOutputs)
    .values(
      Array.from(input.outputs, ([toolCallId, output]) => ({
        messageId: input.messageId,
        toolCallId,
        output,
      })),
    )
    .onConflictDoNothing();
}

export async function getInteractionMessageToolOutput(input: {
  interactionId: string;
  messageId: string;
  toolCallId: string;
}): Promise<{ found: true; output: unknown } | { found: false }> {
  const [row] = await db
    .select({ output: schema.interactionMessageToolOutputs.output })
    .from(schema.interactionMessageToolOutputs)
    .innerJoin(
      schema.interactionMessages,
      eq(schema.interactionMessages.id, schema.interactionMessageToolOutputs.messageId),
    )
    .where(
      and(
        eq(schema.interactionMessageToolOutputs.messageId, input.messageId),
        eq(schema.interactionMessageToolOutputs.toolCallId, input.toolCallId),
        eq(schema.interactionMessages.interactionId, input.interactionId),
      ),
    )
    .limit(1);

  return row ? { found: true, output: row.output } : { found: false };
}

export const TERMINAL_CONVERSATION_RUN_STATUSES = [
  "completed",
  "interrupted",
  "failed",
] as const satisfies ReadonlyArray<ConversationRunStatus>;

export function isTerminalConversationRunStatus(status: ConversationRunStatus) {
  return (TERMINAL_CONVERSATION_RUN_STATUSES as ReadonlyArray<string>).includes(status);
}
