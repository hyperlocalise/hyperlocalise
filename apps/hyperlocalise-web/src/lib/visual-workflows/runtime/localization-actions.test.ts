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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  enqueueFileTranslationJob: vi.fn(),
  createWorkflowTaskJob: vi.fn(),
  updateNativeJob: vi.fn(),
  createTranslationJobEventQueue: vi.fn(() => ({ enqueue: vi.fn() })),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getRepositorySourceFileVersionForStoredFile: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: () => ({
          limit: mocks.selectLimit,
        }),
      })),
    })),
  },
  schema: {
    projects: {
      id: "id",
      organizationId: "organizationId",
      sourceLocale: "sourceLocale",
      targetLocales: "targetLocales",
    },
    jobs: {
      id: "id",
      status: "status",
      organizationId: "organizationId",
      projectId: "projectId",
      inputPayload: "inputPayload",
    },
  },
}));

vi.mock("@/lib/projects/jobs/enqueue-file-translation-job", () => ({
  enqueueFileTranslationJob: (...args: unknown[]) => mocks.enqueueFileTranslationJob(...args),
}));

vi.mock("@/lib/projects/jobs/create-workflow-task-job", () => ({
  createWorkflowTaskJob: (...args: unknown[]) => mocks.createWorkflowTaskJob(...args),
}));

vi.mock("@/lib/projects/jobs/update-native-job", () => ({
  updateNativeJob: (...args: unknown[]) => mocks.updateNativeJob(...args),
}));

vi.mock("@/lib/workflow/queues", () => ({
  createTranslationJobEventQueue: () => mocks.createTranslationJobEventQueue(),
}));

import { err, ok } from "@/lib/primitives/result/results";

import {
  parseWorkflowDueAt,
  runCreateTaskAction,
  runMachineTranslateAction,
  runUpdateJobAction,
} from "./localization-actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const projectId = "11111111-1111-4111-8111-111111111111";
const sourceFileId = "22222222-2222-4222-8222-222222222222";

function projectRow() {
  return { sourceLocale: "en", targetLocales: ["fr-FR", "de-DE"] };
}

describe("runMachineTranslateAction", () => {
  beforeEach(() => {
    mocks.selectLimit.mockReset();
    mocks.enqueueFileTranslationJob.mockReset();
    mocks.createTranslationJobEventQueue.mockClear();
  });

  it("reuses a queued job created by an earlier attempt", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ id: "job_existing", status: "queued" }]);

    const result = await runMachineTranslateAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "",
      useTranslationMemory: true,
      idempotencyKey: "run-1/translate/0",
    });

    expect(result).toEqual({
      ok: true,
      output: { jobId: "job_existing", status: "queued", targetLocales: ["fr-FR", "de-DE"] },
    });
    expect(mocks.enqueueFileTranslationJob).not.toHaveBeenCalled();
  });

  it("does not treat a failed enqueue as success on retry", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ id: "job_failed", status: "failed" }]);

    const result = await runMachineTranslateAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      useTranslationMemory: true,
      idempotencyKey: "run-1/translate/0",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "translation_job_failed",
        message: "The previous translation job for this step failed. No translation was queued.",
      },
    });
    expect(mocks.enqueueFileTranslationJob).not.toHaveBeenCalled();
  });

  it("does not treat a cancelled job as success on retry", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ id: "job_cancelled", status: "cancelled" }]);

    const result = await runMachineTranslateAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      useTranslationMemory: true,
      idempotencyKey: "run-1/translate/0",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("translation_job_cancelled");
    }
    expect(mocks.enqueueFileTranslationJob).not.toHaveBeenCalled();
  });

  it("queues a new job when this step has not created one", async () => {
    mocks.selectLimit.mockResolvedValueOnce([projectRow()]).mockResolvedValueOnce([]);
    mocks.enqueueFileTranslationJob.mockResolvedValue({ ok: true, jobId: "job_new" });

    const result = await runMachineTranslateAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      useTranslationMemory: false,
      idempotencyKey: "run-1/translate/0",
    });

    expect(result).toEqual({
      ok: true,
      output: { jobId: "job_new", status: "queued", targetLocales: ["fr-FR"] },
    });
    expect(mocks.enqueueFileTranslationJob).toHaveBeenCalledOnce();
  });
});

describe("runCreateTaskAction", () => {
  beforeEach(() => {
    mocks.selectLimit.mockReset();
    mocks.createWorkflowTaskJob.mockReset();
  });

  it("reuses a waiting task created by an earlier attempt", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ id: "job_task", status: "waiting_for_review" }]);

    const result = await runCreateTaskAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "edit",
      assigneeWorkosUserId: "user_1",
      title: "Post-edit",
      idempotencyKey: "run-1/task/0",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        jobId: "job_task",
        step: "edit",
        assigned: true,
        targetLocales: ["fr-FR"],
        dueAt: null,
      },
    });
    expect(mocks.createWorkflowTaskJob).not.toHaveBeenCalled();
  });

  it("does not treat a failed task as success on retry", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ id: "job_task_failed", status: "failed" }]);

    const result = await runCreateTaskAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "edit",
      assigneeWorkosUserId: "user_1",
      title: "Post-edit",
      idempotencyKey: "run-1/task/0",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "task_job_failed",
        message: "The previous task for this step failed.",
      },
    });
    expect(mocks.createWorkflowTaskJob).not.toHaveBeenCalled();
  });

  it("creates a task when this step has not created one", async () => {
    mocks.selectLimit.mockResolvedValueOnce([projectRow()]).mockResolvedValueOnce([]);
    mocks.createWorkflowTaskJob.mockResolvedValue(ok({ jobId: "job_new_task", ownerUserId: "u1" }));

    const result = await runCreateTaskAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "proofread",
      assigneeWorkosUserId: "user_1",
      title: "",
      idempotencyKey: "run-1/task/0",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        jobId: "job_new_task",
        step: "proofread",
        assigned: true,
        targetLocales: ["fr-FR"],
        dueAt: null,
      },
    });
    expect(mocks.createWorkflowTaskJob).toHaveBeenCalledOnce();
  });

  it("rejects an invalid due date before creating a task", async () => {
    const result = await runCreateTaskAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "edit",
      assigneeWorkosUserId: "user_1",
      title: "Post-edit",
      dueAt: "next Friday",
      idempotencyKey: "run-1/task/0",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_due_date" } });
    expect(mocks.selectLimit).not.toHaveBeenCalled();
    expect(mocks.createWorkflowTaskJob).not.toHaveBeenCalled();
  });

  it("passes a parsed due date into the created task", async () => {
    mocks.selectLimit.mockResolvedValueOnce([projectRow()]).mockResolvedValueOnce([]);
    mocks.createWorkflowTaskJob.mockResolvedValue(ok({ jobId: "job_due", ownerUserId: "u1" }));

    const result = await runCreateTaskAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "edit",
      assigneeWorkosUserId: "user_1",
      title: "Post-edit",
      dueAt: "2026-05-01T17:00:00.000Z",
      idempotencyKey: "run-1/task/0",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        jobId: "job_due",
        step: "edit",
        assigned: true,
        targetLocales: ["fr-FR"],
        dueAt: "2026-05-01T17:00:00.000Z",
      },
    });
    expect(mocks.createWorkflowTaskJob).toHaveBeenCalledWith(
      expect.objectContaining({ dueAt: new Date("2026-05-01T17:00:00.000Z") }),
    );
  });

  it("returns the stored due date when a waiting task is reused", async () => {
    mocks.selectLimit.mockResolvedValueOnce([projectRow()]).mockResolvedValueOnce([
      {
        id: "job_task",
        status: "waiting_for_review",
        dueAt: new Date("2026-06-02T09:00:00.000Z"),
      },
    ]);

    const result = await runCreateTaskAction({
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "edit",
      assigneeWorkosUserId: "user_1",
      title: "Post-edit",
      dueAt: "2026-05-01T17:00:00.000Z",
      idempotencyKey: "run-1/task/0",
    });

    expect(result).toMatchObject({
      ok: true,
      output: { jobId: "job_task", dueAt: "2026-06-02T09:00:00.000Z" },
    });
    expect(mocks.createWorkflowTaskJob).not.toHaveBeenCalled();
  });
});

describe("parseWorkflowDueAt", () => {
  it("treats empty as clear and invalid text as a parse failure", () => {
    expect(parseWorkflowDueAt(undefined)).toBeNull();
    expect(parseWorkflowDueAt("")).toBeNull();
    expect(parseWorkflowDueAt("   ")).toBeNull();
    expect(parseWorkflowDueAt("not-a-date")).toBeUndefined();
    expect(parseWorkflowDueAt("2026-05-01T17:00:00.000Z")).toEqual(
      new Date("2026-05-01T17:00:00.000Z"),
    );
  });
});

describe("runUpdateJobAction", () => {
  beforeEach(() => {
    mocks.updateNativeJob.mockReset();
  });

  it("rejects an invalid due date and an empty update", async () => {
    await expect(
      runUpdateJobAction({
        organizationId,
        jobId: "job_1",
        assigneeWorkosUserId: "",
        title: "",
        dueAt: "soon",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid_due_date" } });

    await expect(
      runUpdateJobAction({
        organizationId,
        jobId: "job_1",
        assigneeWorkosUserId: "",
        title: "",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "missing_update_job_change" } });

    expect(mocks.updateNativeJob).not.toHaveBeenCalled();
  });

  it("does not send dueAt when the node only clears the due date", async () => {
    await expect(
      runUpdateJobAction({
        organizationId,
        jobId: "job_1",
        assigneeWorkosUserId: "",
        title: "",
        dueAt: "",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "missing_update_job_change" } });

    mocks.updateNativeJob.mockResolvedValueOnce(ok({ id: "job_1" }));
    await expect(
      runUpdateJobAction({
        organizationId,
        jobId: "job_1",
        assigneeWorkosUserId: "",
        title: "Retitle",
        dueAt: "   ",
      }),
    ).resolves.toEqual({
      ok: true,
      output: {
        jobId: "job_1",
        assigned: false,
        renamed: true,
        dueAt: null,
      },
    });
    expect(mocks.updateNativeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { title: "Retitle" },
      }),
    );
    expect(mocks.updateNativeJob.mock.calls[0]?.[0].body).not.toHaveProperty("dueAt");
  });

  it("sends a due date to updateNativeJob and maps a missing job", async () => {
    mocks.updateNativeJob.mockResolvedValueOnce(ok({ id: "job_1" }));

    const result = await runUpdateJobAction({
      organizationId,
      jobId: "job_1",
      assigneeWorkosUserId: "",
      title: "",
      dueAt: "2026-05-01T17:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        jobId: "job_1",
        assigned: false,
        renamed: false,
        dueAt: "2026-05-01T17:00:00.000Z",
      },
    });
    expect(mocks.updateNativeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        jobId: "job_1",
        body: { dueAt: "2026-05-01T17:00:00.000Z" },
      }),
    );

    mocks.updateNativeJob.mockResolvedValueOnce(err({ code: "job_not_found" }));
    await expect(
      runUpdateJobAction({
        organizationId,
        jobId: "job_missing",
        assigneeWorkosUserId: "",
        title: "Retitle",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "job_not_found" } });
  });
});
