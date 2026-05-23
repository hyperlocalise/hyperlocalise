import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import {
  cancelAgentRun,
  completeAgentRun,
  createAgentRun,
  failAgentRun,
  getAgentRun,
  getAgentRunsByExternalJob,
  listAgentRuns,
  startAgentRun,
  updateAgentRun,
  updateAgentRunChangedItems,
} from "./agent-runs";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createTestProject() {
  const { project, user } = await projectFixture.createStoredProjectFixture();
  return { project, user };
}

async function createTestJob(input: {
  organizationId: string;
  projectId: string;
  createdByUserId?: string | null;
}) {
  const jobId = `job_test_${crypto.randomUUID()}`;
  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: jobId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId ?? null,
      kind: "translation",
      status: "queued",
      inputPayload: {},
    })
    .returning();
  return job!;
}

describe("agent runs", () => {
  it("creates an agent run with defaults", async () => {
    const { project } = await createTestProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-1",
      kind: "translate",
    });

    expect(run.status).toBe("queued");
    expect(run.providerKind).toBe("crowdin");
    expect(run.externalJobId).toBe("crowdin-job-1");
    expect(run.kind).toBe("translate");
    expect(run.inputSnapshot).toEqual({});
    expect(run.outputSummary).toEqual({});
    expect(run.changedItems).toEqual([]);
    expect(run.warnings).toEqual([]);
    expect(run.startedAt).toBeNull();
    expect(run.completedAt).toBeNull();
    expect(run.actorUserId).toBeNull();
    expect(run.hyperlocaliseJobId).toBeNull();
  });

  it("creates an agent run with actor, input snapshot, and linked job", async () => {
    const { project, user } = await createTestProject();
    const job = await createTestJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
    });

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      externalJobId: "phrase-job-1",
      externalTaskId: "phrase-task-1",
      kind: "review",
      actorUserId: user.id,
      inputSnapshot: { segments: [{ id: "s1", source: "Hello" }] },
      hyperlocaliseJobId: job.id,
    });

    expect(run.status).toBe("queued");
    expect(run.actorUserId).toBe(user.id);
    expect(run.externalTaskId).toBe("phrase-task-1");
    expect(run.inputSnapshot).toEqual({ segments: [{ id: "s1", source: "Hello" }] });
    expect(run.hyperlocaliseJobId).toBe(job.id);
  });

  it("transitions from queued to running", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-1",
      kind: "qa_fix",
    });

    const started = await startAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    expect(started.status).toBe("running");
    expect(started.startedAt).toBeTruthy();
    expect(started.completedAt).toBeNull();
  });

  it("completes a run with output summary, changed items, and warnings", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      externalJobId: "lokalise-job-1",
      kind: "glossary_suggestion",
    });

    await startAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    const completed = await completeAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
      outputSummary: { approved: 5, rejected: 1 },
      changedItems: [{ keyId: "k1", change: "added term" }],
      warnings: ["low confidence on item 3"],
    });

    expect(completed.status).toBe("succeeded");
    expect(completed.completedAt).toBeTruthy();
    expect(completed.outputSummary).toEqual({ approved: 5, rejected: 1 });
    expect(completed.changedItems).toEqual([{ keyId: "k1", change: "added term" }]);
    expect(completed.warnings).toEqual(["low confidence on item 3"]);
  });

  it("fails a run and preserves partial output", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-2",
      kind: "comment_only",
    });

    await startAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    const failed = await failAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
      outputSummary: { processed: 2 },
      warnings: ["provider API error after 2 items"],
    });

    expect(failed.status).toBe("failed");
    expect(failed.completedAt).toBeTruthy();
    expect(failed.outputSummary).toEqual({ processed: 2 });
    expect(failed.warnings).toEqual(["provider API error after 2 items"]);
  });

  it("fails a queued run and preserves provider context", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-queued-fail",
      kind: "comment_only",
    });

    const failed = await failAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
      outputSummary: { providerStatus: "rejected" },
      warnings: ["duplicate provider job rejected before start"],
    });

    expect(failed.status).toBe("failed");
    expect(failed.startedAt).toBeNull();
    expect(failed.completedAt).toBeTruthy();
    expect(failed.outputSummary).toEqual({ providerStatus: "rejected" });
    expect(failed.warnings).toEqual(["duplicate provider job rejected before start"]);
  });

  it("cancels a running run", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      externalJobId: "phrase-job-2",
      kind: "translate",
    });

    await startAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    const cancelled = await cancelAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completedAt).toBeTruthy();
  });

  it("cancels a queued run", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      externalJobId: "phrase-job-queued-cancel",
      kind: "translate",
    });

    const cancelled = await cancelAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.startedAt).toBeNull();
    expect(cancelled.completedAt).toBeTruthy();
  });

  it("updates run fields independently", async () => {
    const { project, user } = await createTestProject();
    const job = await createTestJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
    });

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-2",
      kind: "review",
    });

    const updated = await updateAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
      outputSummary: { progress: 0.5 },
      changedItems: [{ segmentId: "s1" }],
      warnings: ["spelling mismatch"],
      hyperlocaliseJobId: job.id,
    });

    expect(updated.outputSummary).toEqual({ progress: 0.5 });
    expect(updated.changedItems).toEqual([{ segmentId: "s1" }]);
    expect(updated.warnings).toEqual(["spelling mismatch"]);
    expect(updated.hyperlocaliseJobId).toBe(job.id);
    expect(updated.status).toBe("queued");
  });

  it("updates changed items from the current persisted run state", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-review-callback",
      kind: "translate",
    });

    await startAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    await completeAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
      changedItems: [{ itemId: "a", reviewState: "pending" }],
    });

    await updateAgentRunChangedItems({
      runId: created.id,
      organizationId: project.organizationId,
      changedItems: [{ itemId: "a", reviewState: "accepted" }],
    });

    const updated = await updateAgentRunChangedItems({
      runId: created.id,
      organizationId: project.organizationId,
      changedItems: (run) => [
        ...run.changedItems,
        { itemId: "b", reviewState: "rejected" },
      ],
    });

    expect(updated.changedItems).toEqual([
      { itemId: "a", reviewState: "accepted" },
      { itemId: "b", reviewState: "rejected" },
    ]);
  });

  it("does not update a terminal run", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-terminal-update",
      kind: "review",
    });

    await startAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    await completeAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
      outputSummary: { final: true },
      changedItems: [{ segmentId: "s1", final: true }],
      warnings: ["terminal warning"],
    });

    await expect(
      updateAgentRun({
        runId: created.id,
        organizationId: project.organizationId,
        outputSummary: { progress: 0.5 },
        changedItems: [{ segmentId: "s1", progress: true }],
        warnings: ["stale warning"],
      }),
    ).rejects.toThrow("Agent run not found or not in updatable state");

    const fetched = await getAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    expect(fetched?.outputSummary).toEqual({ final: true });
    expect(fetched?.changedItems).toEqual([{ segmentId: "s1", final: true }]);
    expect(fetched?.warnings).toEqual(["terminal warning"]);
  });

  it("fetches a run by id and organization", async () => {
    const { project } = await createTestProject();

    const created = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      externalJobId: "lokalise-job-2",
      kind: "qa_fix",
    });

    const fetched = await getAgentRun({
      runId: created.id,
      organizationId: project.organizationId,
    });

    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
  });

  it("returns null when run does not exist", async () => {
    const { project } = await createTestProject();

    const fetched = await getAgentRun({
      runId: "00000000-0000-0000-0000-000000000000",
      organizationId: project.organizationId,
    });

    expect(fetched).toBeNull();
  });

  it("lists runs filtered by provider, job, task, kind, and status", async () => {
    const { project } = await createTestProject();

    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-3",
      externalTaskId: "crowdin-task-3",
      kind: "translate",
    });
    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-3",
      externalTaskId: "crowdin-task-3",
      kind: "review",
    });
    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      externalJobId: "phrase-job-3",
      kind: "translate",
    });

    const runs = await listAgentRuns({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-3",
      externalTaskId: "crowdin-task-3",
      kind: "translate",
      status: "queued",
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.kind).toBe("translate");
  });

  it("queries runs by external job and task", async () => {
    const { project } = await createTestProject();

    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-3",
      externalTaskId: "smartling-task-3",
      kind: "translate",
    });
    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-3",
      externalTaskId: "smartling-task-3",
      kind: "review",
    });
    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-3",
      kind: "comment_only",
    });

    const jobRuns = await getAgentRunsByExternalJob({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-3",
    });

    expect(jobRuns).toHaveLength(3);

    const taskRuns = await getAgentRunsByExternalJob({
      organizationId: project.organizationId,
      providerKind: "smartling",
      externalJobId: "smartling-job-3",
      externalTaskId: "smartling-task-3",
    });

    expect(taskRuns).toHaveLength(2);
  });

  it("lists runs by actor and hyperlocalise job", async () => {
    const { project, user } = await createTestProject();
    const job = await createTestJob({
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: user.id,
    });

    await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      externalJobId: "phrase-job-4",
      kind: "translate",
      actorUserId: user.id,
      hyperlocaliseJobId: job.id,
    });

    const byActor = await listAgentRuns({
      organizationId: project.organizationId,
      actorUserId: user.id,
    });

    expect(byActor).toHaveLength(1);
    expect(byActor[0]?.actorUserId).toBe(user.id);

    const byJob = await listAgentRuns({
      organizationId: project.organizationId,
      hyperlocaliseJobId: job.id,
    });

    expect(byJob).toHaveLength(1);
    expect(byJob[0]?.hyperlocaliseJobId).toBe(job.id);
  });

  it("preserves input/output state for review diff screens", async () => {
    const { project } = await createTestProject();

    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      externalJobId: "crowdin-job-diff",
      kind: "review",
      inputSnapshot: {
        segments: [
          { id: "s1", source: "Hello", target: "Bonjour", locale: "fr" },
          { id: "s2", source: "World", target: "Monde", locale: "fr" },
        ],
      },
    });

    await startAgentRun({ runId: run.id, organizationId: project.organizationId });

    await completeAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
      outputSummary: {
        reviewedSegments: 2,
        approved: 1,
        suggestions: [{ segmentId: "s2", proposedTarget: "Le Monde" }],
      },
      changedItems: [{ segmentId: "s2", from: "Monde", to: "Le Monde" }],
      warnings: ["context may be ambiguous for segment s2"],
    });

    const fetched = await getAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
    });

    expect(fetched).not.toBeNull();
    expect(fetched?.inputSnapshot).toEqual({
      segments: [
        { id: "s1", source: "Hello", target: "Bonjour", locale: "fr" },
        { id: "s2", source: "World", target: "Monde", locale: "fr" },
      ],
    });
    expect(fetched?.outputSummary).toEqual({
      reviewedSegments: 2,
      approved: 1,
      suggestions: [{ segmentId: "s2", proposedTarget: "Le Monde" }],
    });
    expect(fetched?.changedItems).toEqual([{ segmentId: "s2", from: "Monde", to: "Le Monde" }]);
    expect(fetched?.warnings).toEqual(["context may be ambiguous for segment s2"]);
  });
});
