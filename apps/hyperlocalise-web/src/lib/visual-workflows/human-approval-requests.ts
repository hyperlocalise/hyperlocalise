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
import "server-only";

import { and, eq, gt, inArray, lte } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { decryptWorkflowPayload, encryptWorkflowPayload } from "./workflow-credentials";

export type HumanApprovalDecision = "approved" | "rejected" | "changes_requested";

type HumanApprovalRequest = typeof schema.visualWorkflowApprovalRequests.$inferSelect;
type ApprovalTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function archiveApprovalInboxItem(
  tx: ApprovalTransaction,
  interactionId: string | null,
  now: Date,
): Promise<void> {
  if (!interactionId) return;

  await tx
    .update(schema.inboxItems)
    .set({ status: "archived", updatedAt: now })
    .where(eq(schema.inboxItems.interactionId, interactionId));
}

type CreateHumanApprovalRequestInput = {
  organizationId: string;
  runId: string;
  nodeRunId: string;
  nodeId: string;
  reviewerType: "user" | "team";
  reviewerId: string;
  prompt: string;
  artifactReference?: string;
  jobReference?: string;
  expiresAt: Date;
};

type CreateHumanApprovalRequestError =
  | { code: "workflow_run_not_found" }
  | { code: "workflow_node_run_not_found" };

export async function createHumanApprovalRequest(
  input: CreateHumanApprovalRequestInput,
): Promise<
  Result<typeof schema.visualWorkflowApprovalRequests.$inferSelect, CreateHumanApprovalRequestError>
> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({ id: schema.visualWorkflowRuns.id })
      .from(schema.visualWorkflowRuns)
      .where(
        and(
          eq(schema.visualWorkflowRuns.id, input.runId),
          eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!run) return err({ code: "workflow_run_not_found" });

    const [nodeRun] = await tx
      .select({
        id: schema.visualWorkflowNodeRuns.id,
        nodeId: schema.visualWorkflowNodeRuns.nodeId,
      })
      .from(schema.visualWorkflowNodeRuns)
      .where(
        and(
          eq(schema.visualWorkflowNodeRuns.id, input.nodeRunId),
          eq(schema.visualWorkflowNodeRuns.runId, input.runId),
          eq(schema.visualWorkflowNodeRuns.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!nodeRun || nodeRun.nodeId !== input.nodeId) {
      return err({ code: "workflow_node_run_not_found" });
    }

    const [created] = await tx
      .insert(schema.visualWorkflowApprovalRequests)
      .values({
        organizationId: input.organizationId,
        runId: input.runId,
        nodeRunId: input.nodeRunId,
        nodeId: input.nodeId,
        reviewerType: input.reviewerType,
        reviewerId: input.reviewerId,
        expiresAt: input.expiresAt,
        encryptedContext: encryptWorkflowPayload({
          prompt: input.prompt,
          ...(input.artifactReference ? { artifactReference: input.artifactReference } : {}),
          ...(input.jobReference ? { jobReference: input.jobReference } : {}),
        }),
      })
      .onConflictDoNothing({
        target: schema.visualWorkflowApprovalRequests.nodeRunId,
      })
      .returning();

    // Replaying the same durable slice reuses the existing request.
    if (!created) {
      const [existing] = await tx
        .select()
        .from(schema.visualWorkflowApprovalRequests)
        .where(eq(schema.visualWorkflowApprovalRequests.nodeRunId, input.nodeRunId))
        .limit(1);

      return ok(existing!);
    }

    const now = new Date();
    const [interaction] = await tx
      .insert(schema.interactions)
      .values({
        organizationId: input.organizationId,
        source: "workflow_approval",
        sourceThreadId: created.id,
        title: "Workflow approval required",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.interactions.id });

    await tx.insert(schema.inboxItems).values({
      interactionId: interaction.id,
      organizationId: input.organizationId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const [request] = await tx
      .update(schema.visualWorkflowApprovalRequests)
      .set({
        interactionId: interaction.id,
        updatedAt: now,
      })
      .where(eq(schema.visualWorkflowApprovalRequests.id, created.id))
      .returning();

    return ok(request);
  });
}

type DecideHumanApprovalRequestInput = {
  requestId: string;
  organizationId: string;
  decidedByUserId: string;
  decision: HumanApprovalDecision;
  commentReference?: string;
  now?: Date;
};

type DecideHumanApprovalRequestError =
  | { code: "approval_not_found" }
  | {
      code: "approval_already_decided";
      status: typeof schema.visualWorkflowApprovalRequests.$inferSelect.status;
    };

export async function decideHumanApprovalRequest(
  input: DecideHumanApprovalRequestInput,
): Promise<
  Result<typeof schema.visualWorkflowApprovalRequests.$inferSelect, DecideHumanApprovalRequestError>
> {
  const now = input.now ?? new Date();

  return db.transaction((tx) => decideHumanApprovalRequestInTransaction(tx, input, now));
}

async function decideHumanApprovalRequestInTransaction(
  tx: ApprovalTransaction,
  input: DecideHumanApprovalRequestInput,
  now: Date,
): Promise<Result<HumanApprovalRequest, DecideHumanApprovalRequestError>> {
  const [decided] = await tx
    .update(schema.visualWorkflowApprovalRequests)
    .set({
      status: input.decision,
      decidedByUserId: input.decidedByUserId,
      commentReference: input.commentReference ?? null,
      decidedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.visualWorkflowApprovalRequests.id, input.requestId),
        eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
        eq(schema.visualWorkflowApprovalRequests.status, "pending"),
        gt(schema.visualWorkflowApprovalRequests.expiresAt, now),
      ),
    )
    .returning();

  if (!decided) {
    const [existing] = await tx
      .select()
      .from(schema.visualWorkflowApprovalRequests)
      .where(
        and(
          eq(schema.visualWorkflowApprovalRequests.id, input.requestId),
          eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!existing) return err({ code: "approval_not_found" });

    if (existing.status === "pending" && existing.expiresAt <= now) {
      const [timedOut] = await tx
        .update(schema.visualWorkflowApprovalRequests)
        .set({ status: "timed_out", decidedAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.visualWorkflowApprovalRequests.id, existing.id),
            eq(schema.visualWorkflowApprovalRequests.status, "pending"),
          ),
        )
        .returning();

      if (timedOut) {
        await archiveApprovalInboxItem(tx, timedOut.interactionId, now);
        return err({ code: "approval_already_decided", status: "timed_out" });
      }

      const [concurrentDecision] = await tx
        .select({ status: schema.visualWorkflowApprovalRequests.status })
        .from(schema.visualWorkflowApprovalRequests)
        .where(eq(schema.visualWorkflowApprovalRequests.id, existing.id))
        .limit(1);

      return err({
        code: "approval_already_decided",
        status: concurrentDecision?.status ?? "timed_out",
      });
    }

    return err({
      code: "approval_already_decided",
      status: existing.status,
    });
  }

  await archiveApprovalInboxItem(tx, decided.interactionId, now);

  return ok(decided);
}

type CloseHumanApprovalRequestInput = {
  requestId: string;
  organizationId: string;
  now?: Date;
};

async function closePendingHumanApprovalRequest(
  input: CloseHumanApprovalRequestInput,
  status: "timed_out" | "cancelled",
): Promise<HumanApprovalRequest | null> {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const conditions = [
      eq(schema.visualWorkflowApprovalRequests.id, input.requestId),
      eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
      eq(schema.visualWorkflowApprovalRequests.status, "pending"),
    ];

    if (status === "timed_out") {
      conditions.push(lte(schema.visualWorkflowApprovalRequests.expiresAt, now));
    }

    const [request] = await tx
      .update(schema.visualWorkflowApprovalRequests)
      .set({ status, decidedAt: now, updatedAt: now })
      .where(and(...conditions))
      .returning();

    if (!request) return null;

    await archiveApprovalInboxItem(tx, request.interactionId, now);
    return request;
  });
}

export async function timeoutHumanApprovalRequest(
  input: CloseHumanApprovalRequestInput,
): Promise<HumanApprovalRequest | null> {
  return closePendingHumanApprovalRequest(input, "timed_out");
}

export async function cancelHumanApprovalRequest(
  input: CloseHumanApprovalRequestInput,
): Promise<HumanApprovalRequest | null> {
  return closePendingHumanApprovalRequest(input, "cancelled");
}

export async function cancelHumanApprovalRequestsForRuns(input: {
  organizationId: string;
  runIds: readonly string[];
  now?: Date;
}): Promise<number> {
  if (input.runIds.length === 0) return 0;
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const cancelled = await tx
      .update(schema.visualWorkflowApprovalRequests)
      .set({ status: "cancelled", decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
          inArray(schema.visualWorkflowApprovalRequests.runId, [...input.runIds]),
          eq(schema.visualWorkflowApprovalRequests.status, "pending"),
        ),
      )
      .returning({ interactionId: schema.visualWorkflowApprovalRequests.interactionId });

    const interactionIds = cancelled.flatMap(({ interactionId }) =>
      interactionId ? [interactionId] : [],
    );
    if (interactionIds.length > 0) {
      await tx
        .update(schema.inboxItems)
        .set({ status: "archived", updatedAt: now })
        .where(inArray(schema.inboxItems.interactionId, interactionIds));
    }

    return cancelled.length;
  });
}

export async function getHumanApprovalRequestByNodeRun(input: {
  organizationId: string;
  nodeRunId: string;
}): Promise<HumanApprovalRequest | null> {
  const [request] = await db
    .select()
    .from(schema.visualWorkflowApprovalRequests)
    .where(
      and(
        eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
        eq(schema.visualWorkflowApprovalRequests.nodeRunId, input.nodeRunId),
      ),
    )
    .limit(1);

  return request ?? null;
}

type AuthorizedHumanApprovalDecisionError =
  | DecideHumanApprovalRequestError
  | { code: "approval_reviewer_forbidden" };

async function canUserDecideHumanApprovalRequest(input: {
  request: HumanApprovalRequest;
  userId: string;
  workosUserId?: string;
  tx?: ApprovalTransaction;
}): Promise<boolean> {
  if (input.request.reviewerType === "user") {
    return (
      input.request.reviewerId === input.userId || input.request.reviewerId === input.workosUserId
    );
  }

  const database = input.tx ?? db;
  const [membership] = await database
    .select({ id: schema.teamMemberships.id })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMemberships.teamId))
    .where(
      and(
        eq(schema.teamMemberships.teamId, input.request.reviewerId),
        eq(schema.teamMemberships.userId, input.userId),
        eq(schema.teams.organizationId, input.request.organizationId),
      ),
    )
    .limit(1);

  return Boolean(membership);
}

export async function getAuthorizedHumanApprovalRequestByInteraction(input: {
  interactionId: string;
  organizationId: string;
  userId: string;
  workosUserId?: string;
}): Promise<
  Result<
    HumanApprovalRequest & {
      context: { prompt: string; artifactReference?: string; jobReference?: string };
    },
    { code: "approval_not_found" | "approval_reviewer_forbidden" }
  >
> {
  const [request] = await db
    .select()
    .from(schema.visualWorkflowApprovalRequests)
    .where(
      and(
        eq(schema.visualWorkflowApprovalRequests.interactionId, input.interactionId),
        eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!request) return err({ code: "approval_not_found" });
  if (
    !(await canUserDecideHumanApprovalRequest({
      request,
      userId: input.userId,
      workosUserId: input.workosUserId,
    }))
  ) {
    return err({ code: "approval_reviewer_forbidden" });
  }

  return ok({
    ...request,
    context: decryptWorkflowPayload(request.encryptedContext) as {
      prompt: string;
      artifactReference?: string;
      jobReference?: string;
    },
  });
}

export async function getAuthorizedHumanApprovalRequest(input: {
  requestId: string;
  organizationId: string;
  userId: string;
  workosUserId?: string;
}): Promise<
  Result<HumanApprovalRequest, { code: "approval_not_found" | "approval_reviewer_forbidden" }>
> {
  const [request] = await db
    .select()
    .from(schema.visualWorkflowApprovalRequests)
    .where(
      and(
        eq(schema.visualWorkflowApprovalRequests.id, input.requestId),
        eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!request) return err({ code: "approval_not_found" });
  return (await canUserDecideHumanApprovalRequest({
    request,
    userId: input.userId,
    workosUserId: input.workosUserId,
  }))
    ? ok(request)
    : err({ code: "approval_reviewer_forbidden" });
}

export async function decideAuthorizedHumanApprovalRequest(input: {
  requestId: string;
  organizationId: string;
  userId: string;
  workosUserId?: string;
  decision: HumanApprovalDecision;
  commentReference?: string;
  now?: Date;
}): Promise<Result<HumanApprovalRequest, AuthorizedHumanApprovalDecisionError>> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(schema.visualWorkflowApprovalRequests)
      .where(
        and(
          eq(schema.visualWorkflowApprovalRequests.id, input.requestId),
          eq(schema.visualWorkflowApprovalRequests.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!request) {
      return err({ code: "approval_not_found" });
    }

    const authorized = await canUserDecideHumanApprovalRequest({
      request,
      userId: input.userId,
      workosUserId: input.workosUserId,
      tx,
    });

    if (!authorized) {
      return err({ code: "approval_reviewer_forbidden" });
    }

    return decideHumanApprovalRequestInTransaction(
      tx,
      {
        requestId: input.requestId,
        organizationId: input.organizationId,
        decidedByUserId: input.userId,
        decision: input.decision,
        ...(input.commentReference ? { commentReference: input.commentReference } : {}),
      },
      now,
    );
  });
}
