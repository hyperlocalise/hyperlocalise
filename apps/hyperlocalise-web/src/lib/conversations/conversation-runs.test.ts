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

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import {
  CONVERSATION_RUN_STALE_AFTER_MS,
  claimConversationRun,
  finishConversationRun,
  getInteractionMessageToolOutput,
  getLatestConversationRun,
  isConversationRunStale,
  isTerminalConversationRunStatus,
  requestConversationRunCancel,
  saveConversationRunSnapshot,
  saveInteractionMessageToolOutputs,
} from "./conversation-runs";

const createdWorkosOrganizationIds = new Set<string>();

async function seedConversation() {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;
  createdWorkosOrganizationIds.add(workosOrganizationId);

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Conversation runs ${suffix}`,
      slug: `conversation-runs-${suffix.slice(0, 8)}`,
    })
    .returning({ id: schema.organizations.id });

  const [interaction] = await db
    .insert(schema.interactions)
    .values({
      organizationId: organization!.id,
      source: "chat_ui",
      title: "Turn claim",
    })
    .returning({ id: schema.interactions.id });

  await db.insert(schema.inboxItems).values({
    interactionId: interaction!.id,
    organizationId: organization!.id,
    status: "active",
  });

  const [userMessage] = await db
    .insert(schema.interactionMessages)
    .values({
      interactionId: interaction!.id,
      senderType: "user",
      text: "Translate this",
    })
    .returning({ id: schema.interactionMessages.id });

  return {
    organizationId: organization!.id,
    interactionId: interaction!.id,
    userMessageId: userMessage!.id,
  };
}

afterEach(async () => {
  for (const workosOrganizationId of createdWorkosOrganizationIds) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
  }
  createdWorkosOrganizationIds.clear();
});

describe("isConversationRunStale", () => {
  const now = new Date("2026-11-11T21:00:00.000Z");

  it("is only stale while running and the heartbeat is older than one minute", () => {
    const heartbeatAt = new Date(now.getTime() - CONVERSATION_RUN_STALE_AFTER_MS - 1);
    expect(isConversationRunStale({ status: "running", heartbeatAt }, now)).toBe(true);
    expect(
      isConversationRunStale(
        {
          status: "running",
          heartbeatAt: new Date(now.getTime() - CONVERSATION_RUN_STALE_AFTER_MS),
        },
        now,
      ),
    ).toBe(false);
    expect(isConversationRunStale({ status: "failed", heartbeatAt }, now)).toBe(false);
    expect(isConversationRunStale({ status: "completed", heartbeatAt }, now)).toBe(false);
  });
});

describe("isTerminalConversationRunStatus", () => {
  it("treats completed, interrupted, and failed as terminal", () => {
    expect(isTerminalConversationRunStatus("completed")).toBe(true);
    expect(isTerminalConversationRunStatus("interrupted")).toBe(true);
    expect(isTerminalConversationRunStatus("failed")).toBe(true);
    expect(isTerminalConversationRunStatus("running")).toBe(false);
  });
});

describe("claimConversationRun", () => {
  it("starts a turn once, then reports it in progress until it finishes", async () => {
    const seed = await seedConversation();
    const now = new Date("2026-11-11T21:00:00.000Z");

    const first = await claimConversationRun({ ...seed, now });
    expect(first).toEqual({ kind: "claimed", runId: expect.any(String) });

    const second = await claimConversationRun({ ...seed, now });
    expect(second.kind).toBe("in_progress");
    if (second.kind !== "in_progress") {
      throw new Error("expected in_progress");
    }
    expect(second.run.id).toBe(first.kind === "claimed" ? first.runId : "");
    expect(second.run.status).toBe("running");
  });

  it("lets the caller retry a failed turn and a hung running turn", async () => {
    const seed = await seedConversation();
    const now = new Date("2026-11-11T21:00:00.000Z");
    const first = await claimConversationRun({ ...seed, now });
    if (first.kind !== "claimed") {
      throw new Error("expected claimed");
    }

    await db
      .update(schema.conversationRuns)
      .set({ status: "failed", snapshotParts: [{ type: "text", text: "partial" }] })
      .where(eq(schema.conversationRuns.id, first.runId));

    const retried = await claimConversationRun({ ...seed, now: new Date(now.getTime() + 1_000) });
    expect(retried).toEqual({ kind: "claimed", runId: first.runId });

    const [cleared] = await db
      .select({
        snapshotParts: schema.conversationRuns.snapshotParts,
        cancelRequestedAt: schema.conversationRuns.cancelRequestedAt,
        agentMessageId: schema.conversationRuns.agentMessageId,
        status: schema.conversationRuns.status,
      })
      .from(schema.conversationRuns)
      .where(eq(schema.conversationRuns.id, first.runId));
    expect(cleared).toMatchObject({
      snapshotParts: null,
      cancelRequestedAt: null,
      agentMessageId: null,
      status: "running",
    });

    await db
      .update(schema.conversationRuns)
      .set({ heartbeatAt: new Date(now.getTime() - CONVERSATION_RUN_STALE_AFTER_MS - 1) })
      .where(eq(schema.conversationRuns.id, first.runId));

    const reclaimed = await claimConversationRun({ ...seed, now });
    expect(reclaimed).toEqual({ kind: "claimed", runId: first.runId });
  });

  it("does not restart a turn that already completed or was interrupted", async () => {
    const seed = await seedConversation();
    const now = new Date("2026-11-11T21:00:00.000Z");
    const first = await claimConversationRun({ ...seed, now });
    if (first.kind !== "claimed") {
      throw new Error("expected claimed");
    }

    await db
      .update(schema.conversationRuns)
      .set({ status: "completed" })
      .where(eq(schema.conversationRuns.id, first.runId));
    const completed = await claimConversationRun({ ...seed, now });
    expect(completed.kind).toBe("already_processed");

    await db
      .update(schema.conversationRuns)
      .set({ status: "interrupted" })
      .where(eq(schema.conversationRuns.id, first.runId));
    const interrupted = await claimConversationRun({ ...seed, now });
    expect(interrupted.kind).toBe("already_processed");
  });

  it("rejects a claim that names a different conversation than the stored user message", async () => {
    const seed = await seedConversation();
    const other = await seedConversation();
    const now = new Date("2026-11-11T21:00:00.000Z");
    await claimConversationRun({ ...seed, now });

    await expect(
      claimConversationRun({
        interactionId: other.interactionId,
        organizationId: other.organizationId,
        userMessageId: seed.userMessageId,
        now,
      }),
    ).rejects.toThrow("conversation run claim conflict");
  });
});

describe("conversation run snapshot, cancel, and finish", () => {
  it("records cancel, keeps a snapshot, then drops it once the agent message exists", async () => {
    const seed = await seedConversation();
    const now = new Date("2026-11-11T21:00:00.000Z");
    const claimed = await claimConversationRun({ ...seed, now });
    if (claimed.kind !== "claimed") {
      throw new Error("expected claimed");
    }

    const parts = [{ type: "text" as const, text: "Hello" }];
    await expect(saveConversationRunSnapshot({ runId: claimed.runId, parts })).resolves.toEqual({
      cancelRequested: false,
    });

    const cancel = await requestConversationRunCancel(seed.interactionId);
    expect(cancel).toMatchObject({ id: claimed.runId, status: "running" });
    const again = await requestConversationRunCancel(seed.interactionId);
    expect(again).toMatchObject({ id: claimed.runId, status: "running" });

    await expect(
      saveConversationRunSnapshot({ runId: claimed.runId, parts: null }),
    ).resolves.toEqual({ cancelRequested: true });

    const [agentMessage] = await db
      .insert(schema.interactionMessages)
      .values({
        interactionId: seed.interactionId,
        senderType: "agent",
        text: "Done",
      })
      .returning({ id: schema.interactionMessages.id });

    await finishConversationRun({
      runId: claimed.runId,
      status: "completed",
      agentMessageId: agentMessage!.id,
    });

    const latest = await getLatestConversationRun(seed.interactionId);
    expect(latest).toMatchObject({
      id: claimed.runId,
      status: "completed",
      agentMessageId: agentMessage!.id,
      snapshotParts: null,
    });
    expect(latest?.cancelRequestedAt).not.toBeNull();
  });

  it("does not finish a turn that is no longer running", async () => {
    const seed = await seedConversation();
    const now = new Date("2026-11-11T21:00:00.000Z");
    const claimed = await claimConversationRun({ ...seed, now });
    if (claimed.kind !== "claimed") {
      throw new Error("expected claimed");
    }
    await db
      .update(schema.conversationRuns)
      .set({ status: "interrupted" })
      .where(eq(schema.conversationRuns.id, claimed.runId));

    await finishConversationRun({
      runId: claimed.runId,
      status: "completed",
      agentMessageId: null,
    });

    const latest = await getLatestConversationRun(seed.interactionId);
    expect(latest?.status).toBe("interrupted");
  });

  it("returns null when no turn is running to cancel", async () => {
    const seed = await seedConversation();
    await expect(requestConversationRunCancel(seed.interactionId)).resolves.toBeNull();
  });
});

describe("interaction message tool outputs", () => {
  it("stores unique tool results and only returns them for the owning conversation", async () => {
    const seed = await seedConversation();
    const other = await seedConversation();
    const [agentMessage] = await db
      .insert(schema.interactionMessages)
      .values({
        interactionId: seed.interactionId,
        senderType: "agent",
        text: "Done",
      })
      .returning({ id: schema.interactionMessages.id });

    await saveInteractionMessageToolOutputs({ messageId: agentMessage!.id, outputs: new Map() });
    await saveInteractionMessageToolOutputs({
      messageId: agentMessage!.id,
      outputs: new Map([
        ["call_1", { content: "full" }],
        ["call_2", { content: "other" }],
      ]),
    });
    await saveInteractionMessageToolOutputs({
      messageId: agentMessage!.id,
      outputs: new Map([["call_1", { content: "ignored-duplicate" }]]),
    });

    await expect(
      getInteractionMessageToolOutput({
        interactionId: seed.interactionId,
        messageId: agentMessage!.id,
        toolCallId: "call_1",
      }),
    ).resolves.toEqual({ found: true, output: { content: "full" } });

    await expect(
      getInteractionMessageToolOutput({
        interactionId: other.interactionId,
        messageId: agentMessage!.id,
        toolCallId: "call_1",
      }),
    ).resolves.toEqual({ found: false });

    await expect(
      getInteractionMessageToolOutput({
        interactionId: seed.interactionId,
        messageId: agentMessage!.id,
        toolCallId: "missing",
      }),
    ).resolves.toEqual({ found: false });
  });
});
