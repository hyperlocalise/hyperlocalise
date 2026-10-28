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
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  cancelHumanApprovalRequest,
  createHumanApprovalRequest,
  decideAuthorizedHumanApprovalRequest,
  decideHumanApprovalRequest,
  timeoutHumanApprovalRequest,
} from "./human-approval-requests";
import type { VisualWorkflowDefinition } from "./schema/types";
import { createVisualWorkflowRun } from "./visual-workflow-runs";
import { createVisualWorkflow, publishVisualWorkflow } from "./visual-workflows";
import { decryptWorkflowPayload } from "./workflow-credentials";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

function workflowDefinition(): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: "Human approval persistence test",
    nodes: [
      {
        id: "trigger",
        type: "trigger.scheduled",
        config: {
          kind: "trigger.scheduled",
          schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
        },
      },
    ],
    edges: [],
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
      },
    },
  };
}

async function seedApprovalNodeRun() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  const { user, organization } = await syncWorkosIdentity(db, identity);

  const createdWorkflow = await createVisualWorkflow({
    organizationId: organization.id,
    authorUserId: user.id,
    name: "Human approval persistence test",
    definition: workflowDefinition(),
  });

  if (isErr(createdWorkflow)) {
    throw new Error(createdWorkflow.error.code);
  }

  const publishedWorkflow = await publishVisualWorkflow({
    organizationId: organization.id,
    visualWorkflowId: createdWorkflow.value.id,
    expectedRevision: createdWorkflow.value.revision,
  });

  if (isErr(publishedWorkflow)) {
    throw new Error(publishedWorkflow.error.code);
  }

  const run = await createVisualWorkflowRun({
    organizationId: organization.id,
    visualWorkflowId: createdWorkflow.value.id,
    triggerSource: "manual",
    idempotencyKey: `approval-test-${randomUUID()}`,
  });

  if (!run) {
    throw new Error("failed_to_create_visual_workflow_run");
  }

  const [nodeRun] = await db
    .insert(schema.visualWorkflowNodeRuns)
    .values({
      organizationId: organization.id,
      runId: run.id,
      nodeId: "approval",
      nodeType: "flow.human_approval",
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  if (!nodeRun) {
    throw new Error("failed_to_create_visual_workflow_node_run");
  }

  return {
    organization,
    user,
    workflow: createdWorkflow.value,
    run,
    nodeRun,
  };
}

function requestInput(
  seeded: Awaited<ReturnType<typeof seedApprovalNodeRun>>,
  overrides: Partial<Parameters<typeof createHumanApprovalRequest>[0]> = {},
): Parameters<typeof createHumanApprovalRequest>[0] {
  return {
    organizationId: seeded.organization.id,
    runId: seeded.run.id,
    nodeRunId: seeded.nodeRun.id,
    nodeId: seeded.nodeRun.nodeId,
    reviewerType: "user",
    reviewerId: seeded.user.id,
    prompt: "Review the French release notes before publishing.",
    artifactReference: "artifact://release-notes/fr-FR",
    jobReference: "job_approval_test",
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

describe("Human Approval request persistence", () => {
  it("creates a durable request and an active Inbox item in one transaction", async () => {
    const seeded = await seedApprovalNodeRun();

    const result = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value).toMatchObject({
      organizationId: seeded.organization.id,
      runId: seeded.run.id,
      nodeRunId: seeded.nodeRun.id,
      nodeId: "approval",
      reviewerType: "user",
      reviewerId: seeded.user.id,
      status: "pending",
      interactionId: expect.any(String),
    });

    const [interaction] = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.id, result.value.interactionId!))
      .limit(1);

    expect(interaction).toMatchObject({
      organizationId: seeded.organization.id,
      source: "workflow_approval",
      sourceThreadId: result.value.id,
      title: "Workflow approval required",
    });

    const [inboxItem] = await db
      .select()
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, result.value.interactionId!))
      .limit(1);

    expect(inboxItem).toMatchObject({
      organizationId: seeded.organization.id,
      status: "active",
    });
  });

  it("encrypts prompt and protected artifact context at rest", async () => {
    const seeded = await seedApprovalNodeRun();

    const result = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const [stored] = await db
      .select({
        encryptedContext: schema.visualWorkflowApprovalRequests.encryptedContext,
      })
      .from(schema.visualWorkflowApprovalRequests)
      .where(eq(schema.visualWorkflowApprovalRequests.id, result.value.id))
      .limit(1);

    expect(stored).toBeDefined();

    const serialized = JSON.stringify(stored!.encryptedContext);

    expect(serialized).not.toContain("Review the French release notes");
    expect(serialized).not.toContain("artifact://release-notes/fr-FR");
    expect(serialized).not.toContain("job_approval_test");

    expect(decryptWorkflowPayload(stored!.encryptedContext)).toEqual({
      prompt: "Review the French release notes before publishing.",
      artifactReference: "artifact://release-notes/fr-FR",
      jobReference: "job_approval_test",
    });
  });

  it("reuses one request and one Inbox item when the durable slice is replayed", async () => {
    const seeded = await seedApprovalNodeRun();
    const input = requestInput(seeded);

    const first = await createHumanApprovalRequest(input);
    const replayed = await createHumanApprovalRequest(input);

    expect(isOk(first)).toBe(true);
    expect(isOk(replayed)).toBe(true);
    if (!isOk(first) || !isOk(replayed)) return;

    expect(replayed.value.id).toBe(first.value.id);
    expect(replayed.value.interactionId).toBe(first.value.interactionId);

    const requests = await db
      .select({ id: schema.visualWorkflowApprovalRequests.id })
      .from(schema.visualWorkflowApprovalRequests)
      .where(eq(schema.visualWorkflowApprovalRequests.nodeRunId, seeded.nodeRun.id));

    expect(requests).toHaveLength(1);

    const inboxItems = await db
      .select({ interactionId: schema.inboxItems.interactionId })
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, first.value.interactionId!));

    expect(inboxItems).toHaveLength(1);
  });

  it("archives the Inbox item after an approval decision", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const decidedAt = new Date(created.value.expiresAt.getTime() - 1_000);
    const decided = await decideHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      decidedByUserId: seeded.user.id,
      decision: "approved",
      commentReference: "comment_approved",
      now: decidedAt,
    });

    expect(isOk(decided)).toBe(true);
    if (!isOk(decided)) return;

    expect(decided.value).toMatchObject({
      status: "approved",
      decidedByUserId: seeded.user.id,
      commentReference: "comment_approved",
      decidedAt,
    });

    const [inboxItem] = await db
      .select({ status: schema.inboxItems.status })
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, created.value.interactionId!))
      .limit(1);

    expect(inboxItem?.status).toBe("archived");
  });

  it("does not allow replayed callbacks to decide twice", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const first = await decideHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      decidedByUserId: seeded.user.id,
      decision: "approved",
    });

    expect(isOk(first)).toBe(true);

    const replayed = await decideHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      decidedByUserId: seeded.user.id,
      decision: "rejected",
    });

    expect(isErr(replayed)).toBe(true);
    if (!isErr(replayed)) return;

    expect(replayed.error).toEqual({
      code: "approval_already_decided",
      status: "approved",
    });

    const [stored] = await db
      .select({
        status: schema.visualWorkflowApprovalRequests.status,
      })
      .from(schema.visualWorkflowApprovalRequests)
      .where(eq(schema.visualWorkflowApprovalRequests.id, created.value.id))
      .limit(1);

    expect(stored?.status).toBe("approved");
  });

  it("rejects a decision from a user who is not the assigned reviewer", async () => {
    const seeded = await seedApprovalNodeRun();
    const otherIdentity = fixture.createWorkosIdentityForOrganization(
      {
        workosOrganizationId: seeded.organization.workosOrganizationId,
        name: seeded.organization.name,
        slug: seeded.organization.slug ?? undefined,
      },
      "reviewer",
    );
    const { user: otherUser } = await syncWorkosIdentity(db, otherIdentity);
    const created = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const result = await decideAuthorizedHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      userId: otherUser.id,
      decision: "approved",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "approval_reviewer_forbidden" },
    });
  });

  it("allows the assigned user reviewer to decide", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const result = await decideAuthorizedHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      userId: seeded.user.id,
      decision: "approved",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toMatchObject({
      status: "approved",
      decidedByUserId: seeded.user.id,
    });
  });

  it("allows a member of the assigned team to decide", async () => {
    const seeded = await seedApprovalNodeRun();
    const [team] = await db
      .insert(schema.teams)
      .values({
        organizationId: seeded.organization.id,
        name: "Release reviewers",
        slug: `release-reviewers-${randomUUID()}`,
      })
      .returning();

    await db.insert(schema.teamMemberships).values({
      teamId: team!.id,
      userId: seeded.user.id,
      role: "member",
    });

    const created = await createHumanApprovalRequest(
      requestInput(seeded, {
        reviewerType: "team",
        reviewerId: team!.id,
      }),
    );

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const result = await decideAuthorizedHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      userId: seeded.user.id,
      decision: "changes_requested",
      commentReference: "comment_team_review",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toMatchObject({
      status: "changes_requested",
      decidedByUserId: seeded.user.id,
      commentReference: "comment_team_review",
    });
  });

  it("times out an expired request and archives its Inbox item", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(
      requestInput(seeded, { expiresAt: new Date("2026-01-01T09:00:00.000Z") }),
    );

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const timedOut = await timeoutHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      now: new Date("2026-01-01T09:00:01.000Z"),
    });

    expect(timedOut).toMatchObject({
      id: created.value.id,
      status: "timed_out",
      decidedAt: new Date("2026-01-01T09:00:01.000Z"),
    });

    const [inboxItem] = await db
      .select({ status: schema.inboxItems.status })
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, created.value.interactionId!))
      .limit(1);

    expect(inboxItem?.status).toBe("archived");
  });

  it("prevents a decision after the deadline", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(
      requestInput(seeded, { expiresAt: new Date("2026-01-01T09:00:00.000Z") }),
    );

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const result = await decideHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
      decidedByUserId: seeded.user.id,
      decision: "approved",
      now: new Date("2026-01-01T09:00:01.000Z"),
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error).toEqual({
      code: "approval_already_decided",
      status: "timed_out",
    });
  });

  it("cancels a pending request and archives its Inbox item", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const cancelled = await cancelHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: seeded.organization.id,
    });

    expect(cancelled).toMatchObject({
      id: created.value.id,
      status: "cancelled",
    });

    const [inboxItem] = await db
      .select({ status: schema.inboxItems.status })
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, created.value.interactionId!))
      .limit(1);

    expect(inboxItem?.status).toBe("archived");
  });

  it("does not expose a request through another organization", async () => {
    const seeded = await seedApprovalNodeRun();
    const created = await createHumanApprovalRequest(requestInput(seeded));

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const result = await decideHumanApprovalRequest({
      requestId: created.value.id,
      organizationId: randomUUID(),
      decidedByUserId: seeded.user.id,
      decision: "approved",
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error).toEqual({
      code: "approval_not_found",
    });
  });

  it("rejects a node run that does not belong to the requested node", async () => {
    const seeded = await seedApprovalNodeRun();

    const result = await createHumanApprovalRequest(
      requestInput(seeded, {
        nodeId: "different-node",
      }),
    );

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error).toEqual({
      code: "workflow_node_run_not_found",
    });

    const requests = await db
      .select({ id: schema.visualWorkflowApprovalRequests.id })
      .from(schema.visualWorkflowApprovalRequests)
      .where(eq(schema.visualWorkflowApprovalRequests.nodeRunId, seeded.nodeRun.id));

    expect(requests).toHaveLength(0);
  });
});
