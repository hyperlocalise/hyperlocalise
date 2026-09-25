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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";

import type { VisualWorkflowDefinition } from "./schema/types";
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
});
