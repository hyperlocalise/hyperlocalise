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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import { createWorkflowTaskJob } from "./create-workflow-task-job";

const mocks = vi.hoisted(() => ({
  startTaskAnalysis: vi.fn(async () => undefined),
  enqueueJobCreatedActivity: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reporting/task-analysis-start", () => ({
  startTaskAnalysis: mocks.startTaskAnalysis,
}));
vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCreatedActivity: mocks.enqueueJobCreatedActivity,
}));

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  mocks.startTaskAnalysis.mockClear();
  await projectFixture.cleanup();
});

describe("createWorkflowTaskJob", () => {
  it("records the task's strings for Reports in the background, under the step's name", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const file = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: "messages.json",
      contentType: "application/json",
      sourceKind: "repository_file",
      metadata: { sourcePath: "locales/messages.json" },
    });
    for (const [step, reportStep] of [
      ["translate", "translation"],
      ["edit", "review"],
      ["proofread", "review"],
    ] as const) {
      const result = await createWorkflowTaskJob({
        organizationId: organization.id,
        projectId: project.id,
        sourceFileId: file.id,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        step,
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(mocks.startTaskAnalysis).toHaveBeenLastCalledWith({
        organizationId: organization.id,
        projectId: project.id,
        jobId: result.value.jobId,
        step: reportStep,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        repositorySourceFileId: expect.any(String),
      });
    }
    expect(mocks.startTaskAnalysis).toHaveBeenCalledTimes(3);
  });

  it("makes a task that comes after an unfinished job wait, and one after a finished job open", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const file = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: "messages.json",
      contentType: "application/json",
      sourceKind: "repository_file",
      metadata: { sourcePath: "locales/messages.json" },
    });
    const task = { organizationId: organization.id, projectId: project.id, sourceFileId: file.id };
    const create = (step: "translate" | "edit" | "proofread", afterJobId?: string) =>
      createWorkflowTaskJob({
        ...task,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        step,
        afterJobId,
      });
    const stored = async (jobId: string) => {
      const [job] = await db
        .select({ status: schema.jobs.status, afterJobId: schema.jobs.afterJobId })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId));
      return job;
    };

    const postEdit = await create("edit");
    if (!isOk(postEdit)) throw new Error("post-edit task not created");
    expect(postEdit.value.status).toBe("waiting_for_review");

    const proofread = await create("proofread", postEdit.value.jobId);
    if (!isOk(proofread)) throw new Error("proofread task not created");
    expect(proofread.value.status).toBe("queued");
    expect(await stored(proofread.value.jobId)).toEqual({
      status: "queued",
      afterJobId: postEdit.value.jobId,
    });

    for (const status of ["succeeded", "cancelled"] as const) {
      await db.update(schema.jobs).set({ status }).where(eq(schema.jobs.id, postEdit.value.jobId));
      const late = await create("proofread", postEdit.value.jobId);
      expect(isOk(late) && late.value.status).toBe("waiting_for_review");
    }

    const translate = await create("translate", postEdit.value.jobId);
    expect(isErr(translate) && translate.error.code).toBe("translate_task_cannot_wait");

    // A job in another project is not one this task can come after.
    const other = await projectFixture.createStoredProjectFixture();
    const [elsewhere] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${crypto.randomUUID()}`,
        organizationId: other.organization.id,
        projectId: other.project.id,
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: {},
      })
      .returning({ id: schema.jobs.id });
    for (const afterJobId of [elsewhere!.id, "job_missing"]) {
      const refused = await create("proofread", afterJobId);
      expect(isErr(refused) && refused.error.code).toBe("after_job_not_found");
    }
  });
});
