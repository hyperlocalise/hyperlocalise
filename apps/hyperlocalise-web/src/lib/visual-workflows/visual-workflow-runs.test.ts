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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { enqueueVisualWorkflowRunStartedActivityMock } = vi.hoisted(() => ({
  enqueueVisualWorkflowRunStartedActivityMock: vi.fn(),
}));

vi.mock("@/lib/activity-log/visual-workflow-events", () => ({
  enqueueVisualWorkflowRunStartedActivity: enqueueVisualWorkflowRunStartedActivityMock,
}));

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";

import type { VisualWorkflowDefinition, VisualWorkflowV3Definition } from "./schema/types";
import {
  createVisualWorkflowRun,
  dispatchManualVisualWorkflowRun,
  enqueueVisualWorkflowRunOnce,
  executeVisualWorkflowRun,
  getVisualWorkflowRunById,
  listVisualWorkflowRuns,
} from "./visual-workflow-runs";
import {
  createVisualWorkflow,
  updateVisualWorkflow,
  publishVisualWorkflow,
} from "./visual-workflows";
import { decryptWorkflowPayload, encryptWorkflowPayload } from "./workflow-credentials";
import { requestWorkflowCancellation } from "./workflow-recovery";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  enqueueVisualWorkflowRunStartedActivityMock.mockClear();
  await fixture.cleanup();
});

function scheduledWorkflowDefinition(name = "Run coverage"): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name,
    nodes: [
      {
        id: "t",
        type: "trigger.scheduled",
        config: {
          kind: "trigger.scheduled",
          schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
        },
      },
    ],
    edges: [],
    editor: { positions: { t: { x: 0, y: 0 } } },
  };
}

function terminalWorkflowDefinition(
  terminal: VisualWorkflowDefinition["nodes"][number],
): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: "Terminal run",
    nodes: [
      {
        id: "trigger",
        type: "trigger.scheduled",
        config: {
          kind: "trigger.scheduled",
          schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
        },
      },
      terminal,
    ],
    edges: [
      {
        id: "trigger-terminal",
        source: "trigger",
        target: terminal.id,
        sourceHandle: null,
        targetHandle: null,
      },
    ],
    editor: { positions: {} },
  };
}

function waitWorkflowDefinition(): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: "Durable Wait",
    nodes: [
      {
        id: "trigger",
        type: "trigger.scheduled",
        config: {
          kind: "trigger.scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 9,
            timezone: "UTC",
          },
        },
      },
      {
        id: "wait",
        type: "flow.wait",
        config: {
          kind: "flow.wait",
          mode: "timestamp",
          timestamp: "2099-01-01T00:00:00.000Z",
        },
      },
      {
        id: "completed",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [
            {
              key: "result",
              value: "completed",
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: "trigger-wait",
        source: "trigger",
        target: "wait",
        sourceHandle: null,
        targetHandle: null,
      },
      {
        id: "wait-completed",
        source: "wait",
        target: "completed",
        sourceHandle: "completed",
        targetHandle: null,
      },
    ],
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        wait: { x: 300, y: 0 },
        completed: { x: 600, y: 0 },
      },
    },
  };
}

function conditionWaitWorkflowDefinition(): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: "Condition Wait timeout",
    nodes: [
      {
        id: "trigger",
        type: "trigger.scheduled",
        config: {
          kind: "trigger.scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 9,
            timezone: "UTC",
          },
        },
      },
      {
        id: "wait",
        type: "flow.wait",
        config: {
          kind: "flow.wait",
          mode: "condition",
          condition: "false",
          pollingIntervalMs: 5_000,
          timeoutMs: 60_000,
        },
      },
      {
        id: "timed-out",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [
            {
              key: "result",
              value: "timed_out",
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: "trigger-wait",
        source: "trigger",
        target: "wait",
        sourceHandle: null,
        targetHandle: null,
      },
      {
        id: "wait-timed-out",
        source: "wait",
        target: "timed-out",
        sourceHandle: "timed_out",
        targetHandle: null,
      },
    ],
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        wait: { x: 300, y: 0 },
        "timed-out": { x: 600, y: 0 },
      },
    },
  };
}

function reusableChildDefinition(result: "input" | "new-version"): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Reusable child",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
        outputFields: [{ path: "customerId", type: "string" }],
      },
      {
        id: "return",
        type: "flow.return",
        config: {
          kind: "flow.return",
          outputs: [{ id: "result", name: "result", type: "string" }],
        },
        inputs: {
          "value.result":
            result === "input"
              ? { kind: "reference", nodeId: "trigger", path: ["customerId"] }
              : { kind: "literal", value: result },
        },
      },
    ],
    edges: [
      {
        id: "trigger-return",
        kind: "execution",
        source: "trigger",
        target: "return",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: {} },
  };
}

function parentDefinition(childWorkflowId: string): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Parent workflow",
    nodes: [
      {
        id: "trigger",
        type: "trigger.scheduled",
        config: {
          kind: "trigger.scheduled",
          schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
        },
      },
      {
        id: "call",
        type: "flow.call_workflow",
        config: {
          kind: "flow.call_workflow",
          workflowId: childWorkflowId,
          version: 1,
          inputFields: [{ id: "customerId", name: "customerId", type: "string", required: true }],
          outputFields: [{ id: "result", name: "result", type: "string", required: true }],
        },
        inputs: { "value.customerId": { kind: "literal", value: "customer-123" } },
      },
    ],
    edges: [
      {
        id: "trigger-call",
        kind: "execution",
        source: "trigger",
        target: "call",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: {} },
  };
}

async function seedWorkflow(input?: { definition?: VisualWorkflowDefinition }) {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  const { user, organization } = await syncWorkosIdentity(db, identity);
  const created = await createVisualWorkflow({
    organizationId: organization.id,
    authorUserId: user.id,
    name: "Run coverage",
    definition: input?.definition ?? scheduledWorkflowDefinition(),
  });
  if (isErr(created)) {
    throw new Error(`failed to create visual workflow: ${created.error.code}`);
  }
  const published = await publishVisualWorkflow({
    organizationId: organization.id,
    visualWorkflowId: created.value.id,
    expectedRevision: created.value.revision,
  });
  if (isErr(published)) throw new Error(published.error.code);
  return { organizationId: organization.id, workflow: published.value };
}

describe("visual workflow runs", () => {
  it("embeds a definition snapshot and reuses idempotent create", async () => {
    const { organizationId, workflow } = await seedWorkflow();

    const first = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "idem-create-1",
      inputSnapshot: { lead: "Ada" },
    });

    expect(first.status).toBe("queued");
    expect(first.idempotencyKey).toBe("idem-create-1");
    expect(first.inputSnapshot).toMatchObject({
      lead: "Ada",
      definitionSnapshot: expect.objectContaining({
        schemaVersion: 3,
        name: "Run coverage",
      }),
    });

    const second = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "idem-create-1",
      inputSnapshot: { lead: "Different" },
    });

    expect(second.id).toBe(first.id);
    expect(second.inputSnapshot).toMatchObject({ lead: "Ada" });
    expect(enqueueVisualWorkflowRunStartedActivityMock).toHaveBeenCalledTimes(1);
    expect(enqueueVisualWorkflowRunStartedActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKind: "system",
        runId: first.id,
        triggerSource: "manual",
        visualWorkflowId: workflow.id,
      }),
    );
  });

  it("skips activity for mock and test runs", async () => {
    const { organizationId, workflow } = await seedWorkflow();

    await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      mode: "mock",
      testDefinition: scheduledWorkflowDefinition("Test run"),
    });

    expect(enqueueVisualWorkflowRunStartedActivityMock).not.toHaveBeenCalled();
  });

  it("propagates cancellation from a parent run to child runs", async () => {
    const { organizationId, workflow } = await seedWorkflow();
    const parent = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "cancel-parent",
    });
    const child = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "cancel-child",
      parentRunId: parent.id,
      parentNodeId: "call",
      traceId: parent.traceId,
      immutableDefinitionVersion: workflow.publishedVersion!,
      enqueue: false,
    });

    await requestWorkflowCancellation({
      organizationId,
      visualWorkflowId: workflow.id,
      runId: parent.id,
    });

    const cancelled = await db
      .select({ id: schema.visualWorkflowRuns.id, at: schema.visualWorkflowRuns.cancelRequestedAt })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.traceId, parent.traceId));
    expect(cancelled.map((run) => run.id).sort()).toEqual([child.id, parent.id].sort());
    expect(cancelled.every((run) => run.at instanceof Date)).toBe(true);
  });

  it("does not cancel a run when the requested workflow ID does not own it", async () => {
    const { organizationId, workflow } = await seedWorkflow();
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "cancel-wrong-workflow",
    });

    const cancelled = await requestWorkflowCancellation({
      organizationId,
      visualWorkflowId: "00000000-0000-4000-8000-000000000001",
      runId: run.id,
    });
    const [stored] = await db
      .select({ cancelRequestedAt: schema.visualWorkflowRuns.cancelRequestedAt })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id));

    expect(cancelled).toBeNull();
    expect(stored?.cancelRequestedAt).toBeNull();
  });

  it("enqueues at most once and clears the marker when enqueue fails", async () => {
    const { organizationId, workflow } = await seedWorkflow();
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "idem-enqueue-1",
    });

    const enqueue = vi.fn(async () => undefined);
    await expect(
      enqueueVisualWorkflowRunOnce({
        runId: run.id,
        organizationId,
        enqueue,
      }),
    ).resolves.toEqual({ enqueuedNow: true, scheduleSlotCommitted: true });
    expect(enqueue).toHaveBeenCalledTimes(1);

    await expect(
      enqueueVisualWorkflowRunOnce({
        runId: run.id,
        organizationId,
        enqueue,
      }),
    ).resolves.toEqual({ enqueuedNow: false, scheduleSlotCommitted: true });
    expect(enqueue).toHaveBeenCalledTimes(1);

    const [marked] = await db
      .select({ outputSummary: schema.visualWorkflowRuns.outputSummary })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id))
      .limit(1);
    expect(typeof marked?.outputSummary.executionEnqueuedAt).toBe("string");

    const failingRun = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "idem-enqueue-fail",
    });
    const failingEnqueue = vi.fn(async () => {
      throw new Error("queue_unavailable");
    });

    await expect(
      enqueueVisualWorkflowRunOnce({
        runId: failingRun.id,
        organizationId,
        enqueue: failingEnqueue,
      }),
    ).rejects.toThrow("queue_unavailable");

    const [cleared] = await db
      .select({ outputSummary: schema.visualWorkflowRuns.outputSummary })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, failingRun.id))
      .limit(1);
    expect(cleared?.outputSummary.executionEnqueuedAt).toBeUndefined();
  });

  it("dispatches manual runs through an injected queue and skips re-enqueue", async () => {
    const { organizationId, workflow } = await seedWorkflow();
    const enqueue = vi.fn(async () => ({ ids: ["visual-run-1"] }));

    const first = await dispatchManualVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      idempotencyKey: "manual-dispatch-1",
      inputSnapshot: { source: "test" },
      queue: { enqueue },
    });
    expect(first).toEqual({ runId: expect.any(String), enqueued: true });
    expect(enqueue).toHaveBeenCalledWith({
      visualWorkflowRunId: first!.runId,
      visualWorkflowId: workflow.id,
      organizationId,
    });

    const second = await dispatchManualVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      idempotencyKey: "manual-dispatch-1",
      queue: { enqueue },
    });
    expect(second).toEqual({ runId: first!.runId, enqueued: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("claims queued runs once, executes trigger graphs, and returns already_finished", async () => {
    const definition = scheduledWorkflowDefinition("Trigger only");
    const { organizationId, workflow } = await seedWorkflow({ definition });
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "exec-1",
      inputSnapshot: { hello: "world" },
    });

    const executed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });
    expect(executed?.status).toBe("succeeded");
    expect(executed?.outputSummary).toMatchObject({
      nodeResults: {
        t: expect.objectContaining({ hello: "world" }),
      },
    });

    const withNodes = await getVisualWorkflowRunById({
      organizationId,
      visualWorkflowId: workflow.id,
      runId: run.id,
      includeNodeRuns: true,
    });
    expect(withNodes?.nodeRuns?.map((nodeRun) => nodeRun.nodeId)).toEqual(["t"]);
    expect(withNodes?.nodeRuns?.[0]?.status).toBe("succeeded");

    const again = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });
    expect(again?.id).toBe(run.id);
    expect(again?.status).toBe("succeeded");
  });

  it("persists declared Return outputs in the run summary", async () => {
    const definition = terminalWorkflowDefinition({
      id: "return",
      type: "flow.return",
      config: {
        kind: "flow.return",
        outputs: [{ id: "order-id", name: "orderId", type: "string" }],
      },
      inputs: { "value.order-id": { kind: "literal", value: "order-123" } },
    });
    const { organizationId, workflow } = await seedWorkflow({ definition });
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "return-summary",
    });

    const executed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(executed).toMatchObject({
      status: "succeeded",
      outputSummary: {
        terminal: { kind: "returned", nodeId: "return", outputs: { orderId: "order-123" } },
        returnedOutputs: { orderId: "order-123" },
      },
    });
  });

  it("runs a pinned child version with shared trace and durable lineage", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const { user, organization } = await syncWorkosIdentity(db, identity);
    const child = await createVisualWorkflow({
      organizationId: organization.id,
      authorUserId: user.id,
      name: "Reusable child",
      definition: reusableChildDefinition("input"),
    });
    if (isErr(child)) throw new Error(child.error.code);
    const childV1 = await publishVisualWorkflow({
      organizationId: organization.id,
      visualWorkflowId: child.value.id,
      expectedRevision: child.value.revision,
    });
    if (isErr(childV1)) throw new Error(childV1.error.code);

    const parent = await createVisualWorkflow({
      organizationId: organization.id,
      authorUserId: user.id,
      name: "Parent workflow",
      definition: parentDefinition(child.value.id),
    });
    if (isErr(parent)) throw new Error(parent.error.code);
    const publishedParent = await publishVisualWorkflow({
      organizationId: organization.id,
      visualWorkflowId: parent.value.id,
      expectedRevision: parent.value.revision,
    });
    if (isErr(publishedParent)) throw new Error(publishedParent.error.code);

    const updatedChild = await updateVisualWorkflow({
      organizationId: organization.id,
      visualWorkflowId: child.value.id,
      expectedRevision: childV1.value.revision,
      definition: reusableChildDefinition("new-version"),
    });
    if (isErr(updatedChild)) throw new Error(updatedChild.error.code);
    const childV2 = await publishVisualWorkflow({
      organizationId: organization.id,
      visualWorkflowId: child.value.id,
      expectedRevision: updatedChild.value.revision,
    });
    if (isErr(childV2)) throw new Error(childV2.error.code);

    const parentRun = await createVisualWorkflowRun({
      organizationId: organization.id,
      visualWorkflowId: parent.value.id,
      triggerSource: "manual",
      idempotencyKey: "parent-child-runtime",
    });
    const executed = await executeVisualWorkflowRun({
      runId: parentRun.id,
      organizationId: organization.id,
      visualWorkflowId: parent.value.id,
    });

    expect(executed).toMatchObject({
      status: "succeeded",
      outputSummary: {
        nodeResults: { call: { value: { result: "customer-123" } } },
      },
    });
    const [childRun] = await db
      .select()
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.parentRunId, parentRun.id))
      .limit(1);
    expect(childRun).toMatchObject({
      visualWorkflowId: child.value.id,
      parentNodeId: "call",
      traceId: parentRun.traceId,
      definitionVersion: 1,
      status: "succeeded",
    });

    // Simulate a worker crash after the child committed but before the parent
    // Call node result was durably recorded. Recovery must reuse the same child.
    await db
      .delete(schema.visualWorkflowNodeRuns)
      .where(
        and(
          eq(schema.visualWorkflowNodeRuns.runId, parentRun.id),
          eq(schema.visualWorkflowNodeRuns.nodeId, "call"),
        ),
      );
    await db
      .update(schema.visualWorkflowRuns)
      .set({
        status: "queued",
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: null,
        outputSummary: {},
      })
      .where(eq(schema.visualWorkflowRuns.id, parentRun.id));

    const recovered = await executeVisualWorkflowRun({
      runId: parentRun.id,
      organizationId: organization.id,
      visualWorkflowId: parent.value.id,
    });
    const childRuns = await db
      .select({ id: schema.visualWorkflowRuns.id })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.parentRunId, parentRun.id));
    const detailedParent = await getVisualWorkflowRunById({
      organizationId: organization.id,
      visualWorkflowId: parent.value.id,
      runId: parentRun.id,
      includeNodeRuns: true,
    });

    expect(recovered).toMatchObject({
      status: "succeeded",
      outputSummary: { nodeResults: { call: { value: { result: "customer-123" } } } },
    });
    expect(childRuns).toEqual([{ id: childRun!.id }]);
    expect(detailedParent?.childRuns).toEqual([
      expect.objectContaining({
        id: childRun!.id,
        parentNodeId: "call",
        traceId: parentRun.traceId,
        nodeRuns: expect.any(Array),
      }),
    ]);
  });

  it("persists controlled terminal failure details in the run summary", async () => {
    const definition = terminalWorkflowDefinition({
      id: "fail",
      type: "flow.fail",
      config: {
        kind: "flow.fail",
        errorCode: "ORDER_REJECTED",
        message: "The order cannot be processed",
      },
    });
    const { organizationId, workflow } = await seedWorkflow({ definition });
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "fail-summary",
    });

    const executed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(executed).toMatchObject({
      status: "failed",
      error: { code: "ORDER_REJECTED", message: "The order cannot be processed" },
      outputSummary: {
        terminal: {
          kind: "failed",
          nodeId: "fail",
          errorCode: "ORDER_REJECTED",
          message: "The order cannot be processed",
        },
      },
    });
  });

  it("fails when the definition snapshot is missing after a version change", async () => {
    const { organizationId, workflow } = await seedWorkflow();
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "missing-snapshot",
    });

    await db
      .update(schema.visualWorkflowRuns)
      .set({
        inputSnapshot: { lead: "no-definition" },
        encryptedPayload: null,
        definitionVersion: workflow.definitionVersion,
      })
      .where(eq(schema.visualWorkflowRuns.id, run.id));

    const updated = await updateVisualWorkflow({
      organizationId,
      visualWorkflowId: workflow.id,
      name: "Renamed after enqueue",
    });
    if (isErr(updated)) {
      throw new Error(`failed to update workflow: ${updated.error.code}`);
    }
    expect(updated.value.definitionVersion).toBeGreaterThan(workflow.definitionVersion);

    await db
      .update(schema.visualWorkflowRuns)
      .set({ definitionVersion: workflow.definitionVersion })
      .where(eq(schema.visualWorkflowRuns.id, run.id));

    const executed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });
    expect(executed?.status).toBe("failed");
    expect(executed?.error).toMatchObject({
      code: "visual_workflow_definition_snapshot_missing",
      message: "visual_workflow_definition_snapshot_missing",
    });
  });

  it("lists runs newest first for a workflow", async () => {
    const { organizationId, workflow } = await seedWorkflow();
    const older = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "list-older",
    });
    const newer = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "list-newer",
    });

    const listed = await listVisualWorkflowRuns({
      organizationId,
      visualWorkflowId: workflow.id,
      limit: 10,
    });
    expect(listed.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it("persists a Wait wakeup and resumes through the completed branch", async () => {
    const { organizationId, workflow } = await seedWorkflow({
      definition: waitWorkflowDefinition(),
    });

    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "durable-wait-resume",
    });

    const paused = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(paused?.status).toBe("running");
    expect(paused?.executionPausedUntil).toBe("2099-01-01T00:00:00.000Z");

    const [stored] = await db
      .select({
        encryptedPayload: schema.visualWorkflowRuns.encryptedPayload,
        leaseExpiresAt: schema.visualWorkflowRuns.leaseExpiresAt,
      })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id))
      .limit(1);

    expect(stored?.encryptedPayload).toBeTruthy();
    expect(stored?.leaseExpiresAt?.toISOString()).toBe("2099-01-01T00:00:00.000Z");

    const payload = decryptWorkflowPayload(stored!.encryptedPayload!) as Record<string, unknown>;

    expect(payload.waitResume).toMatchObject({
      waitNodeId: "wait",
      mode: "timestamp",
      wakeAt: "2099-01-01T00:00:00.000Z",
    });

    const waitResume = payload.waitResume as Record<string, unknown>;
    const resumedPayload = {
      ...payload,
      waitResume: {
        ...waitResume,
        wakeAt: "2020-01-01T00:00:00.000Z",
      },
    };

    // Simulate the durable scheduler waking this run after its persisted time.
    await db
      .update(schema.visualWorkflowRuns)
      .set({
        encryptedPayload: encryptWorkflowPayload(resumedPayload),
        leaseExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
      })
      .where(eq(schema.visualWorkflowRuns.id, run.id));

    const resumed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(resumed?.status).toBe("succeeded");
    expect(resumed?.outputSummary).toMatchObject({
      nodeResults: {
        wait: {
          status: "completed",
          scheduledAt: expect.any(String),
          resumedAt: expect.any(String),
        },
        completed: {
          result: "completed",
        },
      },
    });

    const [finished] = await db
      .select({
        encryptedPayload: schema.visualWorkflowRuns.encryptedPayload,
      })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id))
      .limit(1);

    const finishedPayload = decryptWorkflowPayload(finished!.encryptedPayload!) as Record<
      string,
      unknown
    >;

    expect(finishedPayload.waitResume).toBeUndefined();
  });

  it("resumes a bounded condition through the timed out branch", async () => {
    const { organizationId, workflow } = await seedWorkflow({
      definition: conditionWaitWorkflowDefinition(),
    });

    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "condition-wait-timeout",
    });

    const paused = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(paused?.status).toBe("running");
    expect(paused?.executionPausedUntil).toEqual(expect.any(String));

    const [stored] = await db
      .select({
        encryptedPayload: schema.visualWorkflowRuns.encryptedPayload,
      })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id))
      .limit(1);

    const payload = decryptWorkflowPayload(stored!.encryptedPayload!) as Record<string, unknown>;

    const waitResume = payload.waitResume as Record<string, unknown>;

    expect(waitResume).toMatchObject({
      waitNodeId: "wait",
      mode: "condition",
      timeoutAt: expect.any(String),
    });

    const expiredAt = "2020-01-01T00:00:00.000Z";

    await db
      .update(schema.visualWorkflowRuns)
      .set({
        encryptedPayload: encryptWorkflowPayload({
          ...payload,
          waitResume: {
            ...waitResume,
            wakeAt: expiredAt,
            timeoutAt: expiredAt,
          },
        }),
        leaseExpiresAt: new Date(expiredAt),
      })
      .where(eq(schema.visualWorkflowRuns.id, run.id));

    const resumed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(resumed?.status).toBe("succeeded");
    expect(resumed?.outputSummary).toMatchObject({
      nodeResults: {
        wait: {
          status: "timed_out",
          scheduledAt: expect.any(String),
          resumedAt: expect.any(String),
        },
        "timed-out": {
          result: "timed_out",
        },
      },
    });
  });

  it("cancels a sleeping Wait run without executing its future branch", async () => {
    const { organizationId, workflow } = await seedWorkflow({
      definition: waitWorkflowDefinition(),
    });

    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "cancel-durable-wait",
    });

    const paused = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(paused?.status).toBe("running");
    expect(paused?.executionPausedUntil).toBe("2099-01-01T00:00:00.000Z");

    await requestWorkflowCancellation({
      organizationId,
      visualWorkflowId: workflow.id,
      runId: run.id,
    });

    const cancelled = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(cancelled?.status).toBe("cancelled");

    const withNodes = await getVisualWorkflowRunById({
      organizationId,
      visualWorkflowId: workflow.id,
      runId: run.id,
      includeNodeRuns: true,
    });

    expect(
      withNodes?.nodeRuns?.some(
        (nodeRun) => nodeRun.nodeId === "completed" && nodeRun.status === "succeeded",
      ),
    ).toBe(false);
  });

  it("resumes a due Wait under an armed Merge timeout without forcing timed_out", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 2,
      name: "Wait under Merge timeout",
      nodes: [
        {
          id: "trigger",
          type: "trigger.scheduled",
          config: {
            kind: "trigger.scheduled",
            schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
          },
        },
        {
          id: "email",
          type: "logic.set",
          config: {
            kind: "logic.set",
            assignments: [{ key: "result", value: "sent" }],
          },
        },
        {
          id: "wait",
          type: "flow.wait",
          config: {
            kind: "flow.wait",
            mode: "timestamp",
            timestamp: "2099-01-01T00:00:00.000Z",
          },
        },
        {
          id: "merge",
          type: "logic.merge",
          config: {
            kind: "logic.merge",
            mode: "all",
            timeoutMs: 3_600_000,
            inputs: [
              { id: "email-input", name: "Email" },
              { id: "wait-input", name: "Wait" },
            ],
          },
        },
        {
          id: "done",
          type: "logic.set",
          config: {
            kind: "logic.set",
            assignments: [{ key: "result", value: "merged" }],
          },
        },
      ],
      edges: [
        {
          id: "trigger-email",
          source: "trigger",
          target: "email",
          sourceHandle: null,
          targetHandle: null,
        },
        {
          id: "trigger-wait",
          source: "trigger",
          target: "wait",
          sourceHandle: null,
          targetHandle: null,
        },
        {
          id: "email-merge",
          source: "email",
          target: "merge",
          sourceHandle: null,
          targetHandle: "email-input",
        },
        {
          id: "wait-merge",
          source: "wait",
          target: "merge",
          sourceHandle: "completed",
          targetHandle: "wait-input",
        },
        {
          id: "merge-done",
          source: "merge",
          target: "done",
          sourceHandle: "completed",
          targetHandle: null,
        },
      ],
      editor: { positions: {} },
    };

    const { organizationId, workflow } = await seedWorkflow({ definition });
    const run = await createVisualWorkflowRun({
      organizationId,
      visualWorkflowId: workflow.id,
      triggerSource: "manual",
      idempotencyKey: "wait-under-merge-timeout",
    });

    const paused = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(paused?.status).toBe("running");

    const [stored] = await db
      .select({ encryptedPayload: schema.visualWorkflowRuns.encryptedPayload })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id))
      .limit(1);

    const payload = decryptWorkflowPayload(stored!.encryptedPayload!) as Record<string, unknown>;
    expect(payload.waitResume).toMatchObject({ waitNodeId: "wait" });
    expect(payload.mergeResume).toMatchObject({ mergeNodeId: "merge" });

    const waitResume = payload.waitResume as Record<string, unknown>;
    const mergeResume = payload.mergeResume as Record<string, unknown>;

    // Wait is due now; Merge timeout remains far in the future. The scheduler must
    // execute (not sleep until merge timeout), and Merge must complete.
    await db
      .update(schema.visualWorkflowRuns)
      .set({
        encryptedPayload: encryptWorkflowPayload({
          ...payload,
          waitResume: {
            ...waitResume,
            wakeAt: "2020-01-01T00:00:00.000Z",
          },
          mergeResume: {
            ...mergeResume,
            wakeAt: "2099-06-01T00:00:00.000Z",
          },
        }),
        leaseExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
      })
      .where(eq(schema.visualWorkflowRuns.id, run.id));

    const resumed = await executeVisualWorkflowRun({
      runId: run.id,
      organizationId,
      visualWorkflowId: workflow.id,
    });

    expect(resumed?.status).toBe("succeeded");
    expect(resumed?.outputSummary).toMatchObject({
      nodeResults: {
        wait: { status: "completed" },
        merge: { status: "completed" },
        done: { result: "merged" },
      },
    });

    const [finished] = await db
      .select({ encryptedPayload: schema.visualWorkflowRuns.encryptedPayload })
      .from(schema.visualWorkflowRuns)
      .where(eq(schema.visualWorkflowRuns.id, run.id))
      .limit(1);

    const finishedPayload = decryptWorkflowPayload(finished!.encryptedPayload!) as Record<
      string,
      unknown
    >;
    expect(finishedPayload.waitResume).toBeUndefined();
    expect(finishedPayload.mergeResume).toBeUndefined();
  });
});
