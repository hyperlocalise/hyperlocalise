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
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { ensureAiFeaturesAllowedMock, startTaskAnalysisMock } = vi.hoisted(() => ({
  ensureAiFeaturesAllowedMock: vi.fn(),
  startTaskAnalysisMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reporting/task-analysis-start", () => ({
  startTaskAnalysis: startTaskAnalysisMock,
}));

vi.mock("@/lib/billing/ai-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ai-features")>();
  return { ...actual, ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock };
});

vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCreatedActivity: vi.fn(),
  enqueueJobFailedActivity: vi.fn(),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { err, ok } from "@/lib/primitives/result/results";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
  insertStoredSourceFile,
} from "./public-jobs.fixture";

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({ ids: [event.jobId] }));
const client = testClient<AppType>(createApp({ jobQueue: { enqueue: enqueueJob } }));

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanupPublicApiFixture();
});

async function fixtureWithFile() {
  const fixture = await createPublicApiFixture();
  const sourceFile = await insertStoredSourceFile({
    organizationId: fixture.project.organizationId,
    projectId: fixture.project.id,
    filename: "guide.xliff",
    contentType: "application/xliff+xml",
    sourceKind: "repository_file",
    metadata: { sourcePath: "docs/guide.xliff" },
  });
  const post = (fileInput: Record<string, unknown>, shared: Record<string, unknown> = {}) =>
    client.api.v1.jobs.$post(
      {
        json: {
          type: "file",
          projectId: fixture.project.id,
          ...shared,
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            ...fileInput,
          },
        } as never,
      },
      { headers: { "x-api-key": fixture.apiKey } },
    );
  return { ...fixture, sourceFile, post };
}

type CreatedJob = { job: { id: string; status: string; type: string } };

async function jobRow(jobId: string) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  return job;
}

describe("public file tasks for a person", () => {
  it("makes a post-edit task with no AI run, and a proofread task that waits for it", async () => {
    // AI features off must not block a task that never calls a model.
    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({ code: "ai_features_required", message: "no" }),
    );
    const { project, post } = await fixtureWithFile();

    const first = await post({ step: "post_edit" }, { dueAt: "2026-12-01T09:00:00Z" });
    expect(first.status).toBe(201);
    const postEdit = ((await first.json()) as CreatedJob).job;
    expect(postEdit).toMatchObject({ type: "file", status: "waiting_for_review" });
    const stored = await jobRow(postEdit.id);
    expect(stored).toMatchObject({
      kind: "proofread",
      status: "waiting_for_review",
      afterJobId: null,
      dueAt: new Date("2026-12-01T09:00:00Z"),
    });
    // Stored as an Assign task step stores it, without the request's own step and after.
    expect(stored?.inputPayload).toEqual({
      sourceFileId: expect.any(String),
      fileFormat: "xliff",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      metadata: { workflowTaskStep: "edit", title: "Post-edit: guide.xliff" },
    });
    expect(startTaskAnalysisMock).toHaveBeenLastCalledWith({
      organizationId: project.organizationId,
      projectId: project.id,
      jobId: postEdit.id,
      step: "review",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      repositorySourceFileId: expect.any(String),
    });

    const second = await post({ step: "proofread", after: postEdit.id }, { title: "Revise FR" });
    expect(second.status).toBe(201);
    const proofread = ((await second.json()) as CreatedJob).job;
    expect(proofread.status).toBe("queued");
    const waiting = await jobRow(proofread.id);
    expect(waiting).toMatchObject({ kind: "proofread", status: "queued", afterJobId: postEdit.id });
    expect(waiting?.inputPayload).toMatchObject({
      metadata: { workflowTaskStep: "proofread", title: "Revise FR" },
    });

    // Neither is handed to the AI or charged as an AI job.
    expect(enqueueJob).not.toHaveBeenCalled();
    const usage = await db
      .select({ id: schema.usageEvents.id })
      .from(schema.usageEvents)
      .where(eq(schema.usageEvents.organizationId, project.organizationId));
    expect(usage).toEqual([]);
  });

  it("opens a task straight away when the job it comes after is already finished", async () => {
    const { post } = await fixtureWithFile();
    const postEdit = ((await (await post({ step: "post_edit" })).json()) as CreatedJob).job;
    await db
      .update(schema.jobs)
      .set({ status: "succeeded" })
      .where(eq(schema.jobs.id, postEdit.id));

    const response = await post({ step: "proofread", after: postEdit.id });

    expect(((await response.json()) as CreatedJob).job.status).toBe("waiting_for_review");
  });

  it("refuses a job to come after that is not in the project, and after without a step", async () => {
    const { post } = await fixtureWithFile();
    const other = await fixtureWithFile();
    const elsewhere = ((await (await other.post({ step: "post_edit" })).json()) as CreatedJob).job;

    for (const after of [elsewhere.id, "job_missing"]) {
      const response = await post({ step: "proofread", after });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "after_job_not_found" });
    }

    for (const fileInput of [{ after: elsewhere.id }, { step: "translate" }]) {
      const response = await post(fileInput);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_job_payload" });
    }

    // A step or after outside fileInput is refused, not dropped: the file must not go to the AI.
    for (const misplaced of [{ step: "post_edit" }, { after: elsewhere.id }]) {
      const response = await post({}, misplaced);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_job_payload" });
    }
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("treats a retry with the same key as the same task, and a changed step as another request", async () => {
    const { post, apiKey, project, sourceFile } = await fixtureWithFile();
    const send = (step: string) =>
      client.api.v1.jobs.$post(
        {
          json: {
            type: "file",
            projectId: project.id,
            fileInput: {
              sourceFileId: sourceFile.id,
              fileFormat: "xliff",
              sourceLocale: "en-US",
              targetLocales: ["fr-FR"],
              step,
            },
          } as never,
        },
        { headers: { "x-api-key": apiKey, "idempotency-key": "tasks:1" } },
      );

    const first = await send("post_edit");
    const replay = await send("post_edit");
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as CreatedJob).job.id).toBe(
      ((await first.json()) as CreatedJob).job.id,
    );
    expect((await send("proofread")).status).toBe(422);
    // A file job without a step is still AI work.
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
    const aiJob = ((await (await post({})).json()) as CreatedJob).job;
    expect(aiJob.status).toBe("queued");
    expect(await jobRow(aiJob.id)).toMatchObject({ kind: "translation", afterJobId: null });
    expect(enqueueJob).toHaveBeenCalledOnce();
  });

  it("creates a file task while 50 AI jobs are open", async () => {
    const { project, post } = await fixtureWithFile();
    await db.insert(schema.jobs).values(
      Array.from({ length: 50 }, () => ({
        id: `job_${crypto.randomUUID()}`,
        organizationId: project.organizationId,
        projectId: project.id,
        kind: "translation" as const,
        status: "queued" as const,
        inputPayload: { sourceText: "Hi", sourceLocale: "en-US", targetLocales: ["fr-FR"] },
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })),
    );

    expect((await post({ step: "post_edit" })).status).toBe(201);
    // A file job without a step is AI work, which the open jobs hold back.
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
    const aiJob = await post({});
    expect(aiJob.status).toBe(429);
    expect(await aiJob.json()).toMatchObject({ error: "organization_job_budget_exceeded" });
  });
});
