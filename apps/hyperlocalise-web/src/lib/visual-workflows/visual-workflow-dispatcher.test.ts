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
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { isErr } from "@/lib/primitives/result/results";

import {
  buildVisualWorkflowGithubIdempotencyKey,
  buildVisualWorkflowSourceUploadIdempotencyKey,
} from "./dispatch/idempotency";
import type { VisualWorkflowDefinition, VisualWorkflowGithubTriggerEvent } from "./schema/types";
import {
  dispatchDueScheduledVisualWorkflows,
  dispatchVisualWorkflowForScheduleAndAdvance,
  dispatchVisualWorkflowsForGithubPullRequest,
  dispatchVisualWorkflowsForGithubPush,
  dispatchVisualWorkflowsForSourceUpload,
} from "./visual-workflow-dispatcher";
import { listVisualWorkflowRuns } from "./visual-workflow-runs";
import { createVisualWorkflow, getVisualWorkflowById } from "./visual-workflows";
import type { VisualWorkflowRecord } from "./visual-workflow-types";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

async function seedOrgScope() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  const { user, organization } = await syncWorkosIdentity(db, identity);
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);

  const projectId = `vw-project-${organization.id.slice(0, 8)}`;
  await db.insert(schema.projects).values({
    id: projectId,
    identifier: uniqueTestProjectIdentifier(),
    organizationId: organization.id,
    createdByUserId: user.id,
    name: "Dispatcher Project",
  });

  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;
  await db.insert(schema.githubInstallations).values({
    organizationId: organization.id,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId: organization.id,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: "web",
      fullName: "hyperlocalise/web",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed github repository");
  }

  return {
    organizationId: organization.id,
    userId: user.id,
    projectId,
    repositoryId: repository.id,
  };
}

function scheduledDefinition(name = "Scheduled ping"): VisualWorkflowDefinition {
  return {
    schemaVersion: 1,
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
    editor: { positions: {} },
  };
}

function githubDefinition(
  repositoryId: string,
  input?: {
    name?: string;
    branches?: string[];
    events?: VisualWorkflowGithubTriggerEvent[];
  },
): VisualWorkflowDefinition {
  return {
    schemaVersion: 1,
    name: input?.name ?? "GitHub ping",
    nodes: [
      {
        id: "t",
        type: "trigger.github",
        config: {
          kind: "trigger.github",
          githubInstallationRepositoryId: repositoryId,
          branches: input?.branches ?? ["main"],
          events: input?.events ?? ["push"],
        },
      },
    ],
    edges: [],
    editor: { positions: {} },
  };
}

function sourceUploadDefinition(
  projectId?: string,
  name = "Source upload ping",
): VisualWorkflowDefinition {
  return {
    schemaVersion: 1,
    name,
    nodes: [
      {
        id: "t",
        type: "trigger.source_upload",
        config: projectId
          ? { kind: "trigger.source_upload", projectId }
          : { kind: "trigger.source_upload" },
      },
    ],
    edges: [],
    editor: { positions: {} },
  };
}

async function createActiveWorkflow(input: {
  organizationId: string;
  authorUserId: string;
  name: string;
  definition: VisualWorkflowDefinition;
  projectId?: string;
}): Promise<VisualWorkflowRecord> {
  const created = await createVisualWorkflow({
    organizationId: input.organizationId,
    authorUserId: input.authorUserId,
    projectId: input.projectId,
    name: input.name,
    definition: input.definition,
    status: "active",
  });
  if (isErr(created)) {
    throw new Error(`failed to create visual workflow: ${JSON.stringify(created.error)}`);
  }
  return created.value;
}

function trackingQueue() {
  const enqueued: Array<{
    visualWorkflowRunId: string;
    visualWorkflowId: string;
    organizationId: string;
  }> = [];
  const queue = {
    async enqueue(event: {
      visualWorkflowRunId: string;
      visualWorkflowId: string;
      organizationId: string;
    }) {
      enqueued.push(event);
      return { ids: [`visual-${enqueued.length}`] };
    },
  };
  return { queue, enqueued };
}

describe("visual workflow dispatcher", () => {
  it("dispatches matching GitHub pushes idempotently and skips non-matches", async () => {
    const scope = await seedOrgScope();
    const matching = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Push matcher",
      definition: githubDefinition(scope.repositoryId, { branches: ["main"], events: ["push"] }),
    });
    await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Other branch",
      definition: githubDefinition(scope.repositoryId, {
        name: "Other branch",
        branches: ["develop"],
        events: ["push"],
      }),
    });
    await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "PR only",
      definition: githubDefinition(scope.repositoryId, {
        name: "PR only",
        events: ["pull_request"],
      }),
    });

    const { queue, enqueued } = trackingQueue();
    const first = await dispatchVisualWorkflowsForGithubPush({
      deliveryId: "delivery-vw-push-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repositoryId,
      branch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
      queue,
    });
    const second = await dispatchVisualWorkflowsForGithubPush({
      deliveryId: "delivery-vw-push-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repositoryId,
      branch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
      queue,
    });

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      outcome: "enqueued",
      inserted: true,
      enqueued: true,
      scheduleSlotCommitted: true,
    });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      outcome: "enqueued",
      runId: first[0]?.runId,
      inserted: false,
      enqueued: false,
      scheduleSlotCommitted: true,
    });
    expect(enqueued).toHaveLength(1);

    const runs = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: matching.id,
      limit: 10,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.idempotencyKey).toBe(
      buildVisualWorkflowGithubIdempotencyKey({
        visualWorkflowId: matching.id,
        definitionVersion: matching.definitionVersion,
        githubDeliveryId: "delivery-vw-push-1",
      }),
    );
    expect(runs[0]?.inputSnapshot).toMatchObject({
      githubDeliveryId: "delivery-vw-push-1",
      pushBranch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });
  });

  it("dispatches matching GitHub pull requests with PR snapshot fields", async () => {
    const scope = await seedOrgScope();
    const matching = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "PR matcher",
      definition: githubDefinition(scope.repositoryId, {
        events: ["pull_request"],
        branches: ["main"],
      }),
    });
    await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Push only",
      definition: githubDefinition(scope.repositoryId, { events: ["push"] }),
    });

    const { queue, enqueued } = trackingQueue();
    const results = await dispatchVisualWorkflowsForGithubPullRequest({
      deliveryId: "delivery-vw-pr-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repositoryId,
      action: "opened",
      pullRequestNumber: 42,
      pullRequestUrl: "https://github.com/hyperlocalise/web/pull/42",
      baseBranch: "main",
      headBranch: "feature/locale",
      commitBefore: "ccc333",
      commitAfter: "ddd444",
      queue,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("enqueued");
    expect(enqueued).toHaveLength(1);

    const runs = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: matching.id,
      limit: 10,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.inputSnapshot).toMatchObject({
      githubDeliveryId: "delivery-vw-pr-1",
      githubEvent: "pull_request",
      githubAction: "opened",
      pullRequestNumber: 42,
      pullRequestUrl: "https://github.com/hyperlocalise/web/pull/42",
      baseBranch: "main",
      headBranch: "feature/locale",
      pushBranch: "main",
      commitBefore: "ccc333",
      commitAfter: "ddd444",
    });
  });

  it("advances scheduled nextRunAt only after the schedule slot is committed", async () => {
    const scope = await seedOrgScope();
    const scheduledRunAt = new Date("2026-06-01T09:00:00.000Z");
    const workflow = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Daily schedule",
      definition: scheduledDefinition(),
    });

    await db
      .update(schema.visualWorkflows)
      .set({ nextRunAt: scheduledRunAt })
      .where(eq(schema.visualWorkflows.id, workflow.id));

    const before = await getVisualWorkflowById({
      organizationId: scope.organizationId,
      visualWorkflowId: workflow.id,
    });
    expect(before?.nextRunAt).toBe(scheduledRunAt.toISOString());

    const { queue, enqueued } = trackingQueue();
    const first = await dispatchVisualWorkflowForScheduleAndAdvance({
      workflow: { ...workflow, nextRunAt: scheduledRunAt.toISOString() },
      scheduledRunAt,
      completedAt: scheduledRunAt,
      queue,
    });

    expect(first).toMatchObject({
      outcome: "enqueued",
      inserted: true,
      enqueued: true,
      scheduleSlotCommitted: true,
    });
    expect(enqueued).toHaveLength(1);

    const afterSuccess = await getVisualWorkflowById({
      organizationId: scope.organizationId,
      visualWorkflowId: workflow.id,
    });
    expect(afterSuccess?.nextRunAt).not.toBe(scheduledRunAt.toISOString());
    expect(afterSuccess?.nextRunAt).toBeTruthy();

    const failingWorkflow = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Failing schedule",
      definition: scheduledDefinition("Failing schedule"),
    });
    const failingSlot = new Date("2026-06-02T09:00:00.000Z");
    await db
      .update(schema.visualWorkflows)
      .set({ nextRunAt: failingSlot })
      .where(eq(schema.visualWorkflows.id, failingWorkflow.id));

    const failingQueue = {
      async enqueue() {
        throw new Error("queue_unavailable");
      },
    };

    await expect(
      dispatchVisualWorkflowForScheduleAndAdvance({
        workflow: { ...failingWorkflow, nextRunAt: failingSlot.toISOString() },
        scheduledRunAt: failingSlot,
        completedAt: failingSlot,
        queue: failingQueue,
      }),
    ).rejects.toThrow("queue_unavailable");

    const afterFailure = await getVisualWorkflowById({
      organizationId: scope.organizationId,
      visualWorkflowId: failingWorkflow.id,
    });
    expect(afterFailure?.nextRunAt).toBe(failingSlot.toISOString());
  });

  it("skips inactive workflows for schedule dispatch", async () => {
    const scope = await seedOrgScope();
    const draft = expectOk(
      await createVisualWorkflow({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Draft schedule",
        definition: scheduledDefinition("Draft schedule"),
        status: "draft",
      }),
    );

    const { queue, enqueued } = trackingQueue();
    const result = await dispatchVisualWorkflowForScheduleAndAdvance({
      workflow: draft,
      scheduledRunAt: new Date("2026-06-01T09:00:00.000Z"),
      queue,
    });

    expect(result).toEqual({
      outcome: "skipped",
      runId: "",
      inserted: false,
      enqueued: false,
      scheduleSlotCommitted: false,
      skipReason: "workflow_not_active",
    });
    expect(enqueued).toHaveLength(0);
  });

  it("dispatches source uploads idempotently and filters by project", async () => {
    const scope = await seedOrgScope();
    const otherProjectId = `vw-other-${scope.organizationId.slice(0, 8)}`;
    await db.insert(schema.projects).values({
      id: otherProjectId,
      identifier: uniqueTestProjectIdentifier("other"),
      organizationId: scope.organizationId,
      createdByUserId: scope.userId,
      name: "Other Project",
    });

    const matching = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Matching upload",
      definition: sourceUploadDefinition(scope.projectId, "Matching upload"),
      projectId: scope.projectId,
    });
    await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Other project upload",
      definition: sourceUploadDefinition(otherProjectId, "Other project upload"),
      projectId: otherProjectId,
    });

    const { queue, enqueued } = trackingQueue();
    const first = await dispatchVisualWorkflowsForSourceUpload({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourceFileId: "source-file-1",
      queue,
    });
    const duplicate = await dispatchVisualWorkflowsForSourceUpload({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourceFileId: "source-file-1",
      queue,
    });

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      outcome: "enqueued",
      inserted: true,
      enqueued: true,
    });
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]).toMatchObject({
      outcome: "enqueued",
      runId: first[0]?.runId,
      inserted: false,
      enqueued: false,
    });
    expect(enqueued).toHaveLength(1);

    const runs = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: matching.id,
      limit: 10,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.idempotencyKey).toBe(
      buildVisualWorkflowSourceUploadIdempotencyKey({
        visualWorkflowId: matching.id,
        definitionVersion: matching.definitionVersion,
        sourceFileId: "source-file-1",
      }),
    );
    expect(runs[0]?.inputSnapshot).toMatchObject({
      projectId: scope.projectId,
      sourceFileId: "source-file-1",
    });
  });

  it("isolates per-workflow enqueue failures during GitHub push dispatch", async () => {
    const scope = await seedOrgScope();
    const firstWorkflow = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "First push",
      definition: githubDefinition(scope.repositoryId, { name: "First push" }),
    });
    const secondWorkflow = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Second push",
      definition: githubDefinition(scope.repositoryId, { name: "Second push" }),
    });

    let enqueueCalls = 0;
    const enqueued: string[] = [];
    const queue = {
      async enqueue(event: { visualWorkflowRunId: string; visualWorkflowId: string }) {
        enqueueCalls += 1;
        if (enqueueCalls === 1) {
          throw new Error("transient_queue_error");
        }
        enqueued.push(event.visualWorkflowId);
        return { ids: [`visual-${enqueueCalls}`] };
      },
    };

    const results = await dispatchVisualWorkflowsForGithubPush({
      deliveryId: "delivery-vw-isolate-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repositoryId,
      branch: "main",
      commitBefore: "eee555",
      commitAfter: "fff666",
      queue,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("enqueued");
    expect(results[0]?.enqueued).toBe(true);
    expect(enqueued).toHaveLength(1);
    expect([firstWorkflow.id, secondWorkflow.id]).toContain(enqueued[0]);

    const firstRuns = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: firstWorkflow.id,
      limit: 10,
    });
    const secondRuns = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: secondWorkflow.id,
      limit: 10,
    });
    // Both workflows insert a run; only the successful enqueue keeps the marker.
    expect(firstRuns.length + secondRuns.length).toBe(2);
    expect(
      [...firstRuns, ...secondRuns].filter(
        (run) => typeof run.outputSummary.executionEnqueuedAt === "string",
      ),
    ).toHaveLength(1);
  });

  it("dispatches due scheduled workflows and continues after one failure", async () => {
    const scope = await seedOrgScope();
    const dueAt = new Date("2026-07-01T09:00:00.000Z");
    const now = new Date("2026-07-01T09:05:00.000Z");

    const okWorkflow = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Due ok",
      definition: scheduledDefinition("Due ok"),
    });
    const failWorkflow = await createActiveWorkflow({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Due fail",
      definition: scheduledDefinition("Due fail"),
    });

    await db
      .update(schema.visualWorkflows)
      .set({ nextRunAt: dueAt })
      .where(eq(schema.visualWorkflows.id, okWorkflow.id));
    await db
      .update(schema.visualWorkflows)
      .set({ nextRunAt: dueAt })
      .where(eq(schema.visualWorkflows.id, failWorkflow.id));

    const queue = {
      async enqueue(event: { visualWorkflowId: string }) {
        if (event.visualWorkflowId === failWorkflow.id) {
          throw new Error("scheduled_queue_down");
        }
        return { ids: ["visual-due-ok"] };
      },
    };

    const results = await dispatchDueScheduledVisualWorkflows({
      now,
      limit: 50,
      queue,
    });

    expect(results.some((result) => result.outcome === "enqueued" && result.enqueued)).toBe(true);

    const okRuns = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: okWorkflow.id,
      limit: 10,
    });
    const failRuns = await listVisualWorkflowRuns({
      organizationId: scope.organizationId,
      visualWorkflowId: failWorkflow.id,
      limit: 10,
    });
    expect(okRuns).toHaveLength(1);
    expect(okRuns[0]?.outputSummary.executionEnqueuedAt).toEqual(expect.any(String));
    expect(failRuns).toHaveLength(1);
    expect(failRuns[0]?.outputSummary.executionEnqueuedAt).toBeUndefined();

    const okAfter = await getVisualWorkflowById({
      organizationId: scope.organizationId,
      visualWorkflowId: okWorkflow.id,
    });
    const failAfter = await getVisualWorkflowById({
      organizationId: scope.organizationId,
      visualWorkflowId: failWorkflow.id,
    });

    expect(okAfter?.nextRunAt).not.toBe(dueAt.toISOString());
    expect(failAfter?.nextRunAt).toBe(dueAt.toISOString());
  });
});
