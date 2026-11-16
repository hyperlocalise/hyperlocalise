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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk, ok } from "@/lib/primitives/result/results";
import { claimTranslationJob } from "@/lib/translation/jobs";

vi.mock("@/lib/billing/ai-features", () => ({
  ensureAiFeaturesAllowed: vi.fn(async () => ok(undefined)),
}));

import { enqueueExistingFileTranslationJob } from "./enqueue-file-translation-job";
import { markTaskDone } from "./mark-task-done";
import { openWaitingTasks } from "./waiting-task";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("a waiting task", () => {
  it("is never started as AI work, and cannot be marked done until it opens", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const job = { organizationId: organization.id, projectId: project.id };
    const [earlier] = await db
      .insert(schema.jobs)
      .values({
        ...job,
        id: `job_${randomUUID()}`,
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: { metadata: { workflowTaskStep: "edit" } },
      })
      .returning();
    const [task] = await db
      .insert(schema.jobs)
      .values({
        ...job,
        id: `job_${randomUUID()}`,
        ownerUserId: user.id,
        assigneeType: "user",
        kind: "proofread",
        status: "queued",
        afterJobId: earlier!.id,
        inputPayload: { metadata: { workflowTaskStep: "proofread" } },
      })
      .returning();
    await db.insert(schema.translationJobDetails).values({ jobId: task!.id, type: "file" });

    const enqueue = vi.fn(async () => ({ ids: ["run"] }));
    const assigned = await enqueueExistingFileTranslationJob({
      organizationId: organization.id,
      jobId: task!.id,
      jobQueue: { enqueue },
    });
    expect(assigned).toMatchObject({ ok: false, code: "file_translation_job_required" });
    expect(enqueue).not.toHaveBeenCalled();

    await expect(
      claimTranslationJob({
        event: { kind: "translation", jobId: task!.id, projectId: project.id, type: "file" },
        runId: "wrun_test",
      }),
    ).rejects.toThrow();

    const done = await markTaskDone({
      organizationId: organization.id,
      jobId: task!.id,
      actorUserId: user.id,
      actorMayFinishAnyTask: true,
      accessWhere: eq(schema.jobs.organizationId, organization.id),
    });
    expect(isErr(done) && done.error.code).toBe("job_action_unavailable");

    const [after] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, task!.id));
    expect(after).toMatchObject({
      status: "queued",
      workflowRunId: null,
      assigneeType: "user",
      ownerUserId: user.id,
    });

    // Once the earlier task is marked done, the next sweep opens it and it can be marked done.
    const finish = (jobId: string) =>
      markTaskDone({
        organizationId: organization.id,
        jobId,
        actorUserId: user.id,
        actorMayFinishAnyTask: true,
        accessWhere: eq(schema.jobs.organizationId, organization.id),
      });
    expect(isOk(await finish(earlier!.id))).toBe(true);
    expect(await openWaitingTasks(db, { organizationId: organization.id })).toBe(1);
    expect(isOk(await finish(task!.id))).toBe(true);
  });
});
