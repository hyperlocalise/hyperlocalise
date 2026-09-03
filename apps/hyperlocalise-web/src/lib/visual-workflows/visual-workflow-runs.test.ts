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

import { createDefaultConfig } from "./catalog/node-catalog";
import type { VisualWorkflowDefinition } from "./schema/types";
import {
  createVisualWorkflowRun,
  dispatchManualVisualWorkflowRun,
  enqueueVisualWorkflowRunOnce,
  executeVisualWorkflowRun,
  getVisualWorkflowRunById,
  listVisualWorkflowRuns,
} from "./visual-workflow-runs";
import { createVisualWorkflow, updateVisualWorkflow } from "./visual-workflows";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function seedWorkflow(input?: { definition?: VisualWorkflowDefinition }) {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  const { user, organization } = await syncWorkosIdentity(db, identity);
  const created = await createVisualWorkflow({
    organizationId: organization.id,
    authorUserId: user.id,
    name: "Run coverage",
    definition: input?.definition,
  });
  if (isErr(created)) {
    throw new Error(`failed to create visual workflow: ${created.error.code}`);
  }
  return { organizationId: organization.id, workflow: created.value };
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
        schemaVersion: 1,
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
    ).resolves.toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);

    await expect(
      enqueueVisualWorkflowRunOnce({
        runId: run.id,
        organizationId,
        enqueue,
      }),
    ).resolves.toBe(false);
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
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Trigger only",
      nodes: [
        {
          id: "t",
          type: "trigger.manual",
          config: createDefaultConfig("trigger.manual"),
        },
      ],
      edges: [],
      editor: { positions: {} },
    };
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
});
