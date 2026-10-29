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
import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  captureJobStatus: vi.fn(async (_input: { jobId: string }) => undefined),
  recordJobEvents: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reporting/capture", () => ({ captureJobStatus: mocks.captureJobStatus }));
vi.mock("@/lib/job-events/job-events-writer", () => ({ recordJobEvents: mocks.recordJobEvents }));

import { markTaskDone } from "./mark-task-done";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  await projectFixture.cleanup();
});

async function createTask(values: Partial<typeof schema.jobs.$inferInsert> = {}) {
  const { organization, project, user } = await projectFixture.createStoredProjectFixture();
  const [task] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      kind: "proofread",
      status: "waiting_for_review",
      inputPayload: {},
      ...values,
    })
    .returning();

  return {
    task,
    user,
    organization,
    input: {
      organizationId: organization.id,
      jobId: task.id,
      actorUserId: user.id,
      actorMayFinishAnyTask: true,
      accessWhere: eq(schema.jobs.organizationId, organization.id),
    },
  };
}

async function readStatus(jobId: string) {
  const [row] = await db
    .select({ status: schema.jobs.status, completedAt: schema.jobs.completedAt })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));
  return row;
}

describe("markTaskDone", () => {
  it("finishes a task for people before telling Reports, so its fixed fee is charged", async () => {
    const { task, user, input } = await createTask();
    let statusWhenReportsWasTold: string | undefined;
    mocks.captureJobStatus.mockImplementation(async ({ jobId }) => {
      statusWhenReportsWasTold = (await readStatus(jobId)).status;
    });

    const result = await markTaskDone(input);

    expect(isOk(result) && result.value).toEqual({ id: task.id });
    const done = await readStatus(task.id);
    expect(done.status).toBe("succeeded");
    expect(done.completedAt).not.toBeNull();
    expect(statusWhenReportsWasTold).toBe("succeeded");
    expect(mocks.captureJobStatus).toHaveBeenCalledWith({
      jobId: task.id,
      status: "succeeded",
      operationKey: `done:${task.id}`,
    });
    expect(mocks.recordJobEvents).toHaveBeenCalledWith({
      jobId: task.id,
      actorUserId: user.id,
      events: [{ type: "job_marked_done", payload: {} }],
    });
  });

  it("finishes a translation task assigned to a person", async () => {
    const { task, input } = await createTask({
      kind: "translation",
      assigneeType: "user",
    });

    expect(isOk(await markTaskDone(input))).toBe(true);
    expect((await readStatus(task.id)).status).toBe("succeeded");
  });

  it.each<[string, Partial<typeof schema.jobs.$inferInsert>, boolean?]>([
    ["an agent's job", { kind: "translation", assigneeType: "agent" }],
    ["an AI review", { kind: "review" }],
    ["a task already cancelled", { status: "cancelled" }],
    ["a task still queued", { status: "queued" }],
    ["a task mirrored from a provider", {}, true],
  ])("leaves %s alone", async (_label, values, providerBacked) => {
    const { task, input } = await createTask(values);
    if (providerBacked) {
      await db.insert(schema.externalJobDetails).values({
        jobId: task.id,
        organizationId: task.organizationId,
        providerKind: "crowdin",
        externalJobId: `task_${randomUUID()}`,
        externalTaskId: `task_${randomUUID()}`,
        externalStatus: "open",
      });
    }

    const result = await markTaskDone(input);

    expect(isErr(result) && result.error.code).toBe("job_action_unavailable");
    expect((await readStatus(task.id)).status).toBe(values.status ?? "waiting_for_review");
    expect(mocks.captureJobStatus).not.toHaveBeenCalled();
  });

  it("lets someone without review rights finish only a task assigned to them", async () => {
    const { task, user, input } = await createTask();
    const restricted = { ...input, actorMayFinishAnyTask: false };

    const refused = await markTaskDone(restricted);
    expect(isErr(refused) && refused.error.code).toBe("not_task_assignee");

    const colleague = await projectFixture.createStoredProjectFixture();
    await db
      .update(schema.jobs)
      .set({ ownerUserId: colleague.user.id, assigneeType: "user" })
      .where(eq(schema.jobs.id, task.id));
    const refusedForColleague = await markTaskDone(restricted);
    expect(isErr(refusedForColleague) && refusedForColleague.error.code).toBe("not_task_assignee");
    expect((await readStatus(task.id)).status).toBe("waiting_for_review");

    await db
      .update(schema.jobs)
      .set({ ownerUserId: user.id, assigneeType: "user" })
      .where(eq(schema.jobs.id, task.id));
    expect(isOk(await markTaskDone(restricted))).toBe(true);
    expect((await readStatus(task.id)).status).toBe("succeeded");
  });

  it("does not find a task in another workspace", async () => {
    const { task } = await createTask();
    const other = await createTask();

    const result = await markTaskDone({ ...other.input, jobId: task.id });

    expect(isErr(result) && result.error.code).toBe("job_not_found");
    expect((await readStatus(task.id)).status).toBe("waiting_for_review");
  });
});
