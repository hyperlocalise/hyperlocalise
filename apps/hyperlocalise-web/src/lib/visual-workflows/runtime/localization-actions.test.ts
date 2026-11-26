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
  enqueueStringTranslationJob: vi.fn(),
  createWorkflowTaskJob: vi.fn(),
  updateNativeJob: vi.fn(),
  createTranslationJobEventQueue: vi.fn(() => ({ enqueue: vi.fn() })),
  runProjectTranslationQaScan: vi.fn(),
  getRepositorySourceFileVersionForStoredFile: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getRepositorySourceFileVersionForStoredFile: (...args: unknown[]) =>
    mocks.getRepositorySourceFileVersionForStoredFile(...args),
}));

vi.mock("@/lib/qa/run-project-qa-scan", () => ({
  runProjectTranslationQaScan: (...args: unknown[]) => mocks.runProjectTranslationQaScan(...args),
}));

vi.mock("@/lib/database/client", () => {
  const select = vi.fn(() => {
    const query: {
      from: () => typeof query;
      leftJoin: () => typeof query;
      where: () => typeof query;
      limit: typeof mocks.selectLimit;
    } = {
      from: () => query,
      leftJoin: () => query,
      where: () => query,
      limit: mocks.selectLimit,
    };
    return query;
  });
  return {
    db: { select },
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
        createdAt: "createdAt",
      },
      translationJobDetails: {
        jobId: "jobId",
        sourceFileVersionId: "sourceFileVersionId",
      },
      repositorySourceFileVersions: {
        id: "id",
        organizationId: "organizationId",
        projectId: "projectId",
        repositorySourceFileId: "repositorySourceFileId",
      },
      translationQaRuns: {
        id: "id",
        errorCount: "errorCount",
        warningCount: "warningCount",
        findingCount: "findingCount",
        summary: "summary",
      },
    },
  };
});

vi.mock("@/lib/projects/jobs/enqueue-file-translation-job", () => ({
  enqueueFileTranslationJob: (...args: unknown[]) => mocks.enqueueFileTranslationJob(...args),
}));

vi.mock("@/lib/projects/jobs/enqueue-string-translation-job", () => ({
  enqueueStringTranslationJob: (...args: unknown[]) => mocks.enqueueStringTranslationJob(...args),
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
  runCreateTranslationJobAction,
  runCreateTaskAction,
  runMachineTranslateAction,
  runQaChecksAction,
  runUpdateJobAction,
} from "./localization-actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const projectId = "11111111-1111-4111-8111-111111111111";
const sourceFileId = "22222222-2222-4222-8222-222222222222";

function projectRow() {
  return { sourceLocale: "en", targetLocales: ["fr-FR", "de-DE"] };
}

describe("runCreateTranslationJobAction", () => {
  beforeEach(() => {
    mocks.selectLimit.mockReset();
    mocks.enqueueFileTranslationJob.mockReset();
    mocks.enqueueStringTranslationJob.mockReset();
    mocks.createTranslationJobEventQueue.mockClear();
  });

  it("creates a string job with bounded structured context", async () => {
    mocks.selectLimit.mockResolvedValueOnce([projectRow()]);
    mocks.enqueueStringTranslationJob.mockResolvedValue({
      ok: true,
      jobId: "job_string",
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      status: "queued",
      replayed: false,
    });

    const result = await runCreateTranslationJobAction({
      organizationId,
      projectId,
      sourceKind: "string",
      sourceText: "Hello",
      sourceFileId: "",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
      instructions: "Keep names unchanged.",
      contextOverrides: { domain: "commerce" },
      idempotencyKey: "run-1/create-job/0",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        jobId: "job_string",
        status: "queued",
        targetLocales: ["fr-FR", "de-DE"],
        createdAt: "2026-01-02T03:04:05.000Z",
      },
    });
    expect(mocks.enqueueStringTranslationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId,
        sourceText: "Hello",
        context: 'Keep names unchanged.\n\n{"domain":"commerce"}',
        metadata: { workflowStepKey: "run-1/create-job/0" },
      }),
    );
  });

  it("creates a file job and returns inspectable creation metadata", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-02-03T04:05:06.000Z"), status: "queued" },
      ]);
    mocks.enqueueFileTranslationJob.mockResolvedValue({ ok: true, jobId: "job_file" });

    const result = await runCreateTranslationJobAction({
      organizationId,
      projectId,
      sourceKind: "file",
      sourceText: "",
      sourceFileId,
      sourceLocale: "en",
      targetLocales: "fr-FR",
      instructions: "",
      contextOverrides: {},
    });

    expect(result).toEqual({
      ok: true,
      output: {
        jobId: "job_file",
        status: "queued",
        targetLocales: ["fr-FR"],
        createdAt: "2026-02-03T04:05:06.000Z",
      },
    });
    expect(mocks.enqueueFileTranslationJob).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, projectId, sourceFileId }),
    );
  });

  it("rejects cross-organization projects and cancelled execution", async () => {
    mocks.selectLimit.mockResolvedValueOnce([]);
    const denied = await runCreateTranslationJobAction({
      organizationId,
      projectId,
      sourceKind: "string",
      sourceText: "Hello",
      sourceFileId: "",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      instructions: "",
      contextOverrides: {},
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "project_not_found" } });

    const controller = new AbortController();
    controller.abort();
    const cancelled = await runCreateTranslationJobAction({
      organizationId,
      projectId,
      sourceKind: "string",
      sourceText: "Hello",
      sourceFileId: "",
      sourceLocale: "en",
      targetLocales: ["fr-FR"],
      instructions: "",
      contextOverrides: {},
      signal: controller.signal,
    });
    expect(cancelled).toMatchObject({ ok: false, error: { code: "execution_cancelled" } });
  });
});

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

  it("passes the task to come after, and reports why such a task was refused", async () => {
    mocks.selectLimit.mockResolvedValue([]).mockResolvedValueOnce([projectRow()]);
    mocks.createWorkflowTaskJob.mockResolvedValue(ok({ jobId: "job_later", ownerUserId: "u1" }));
    const task = {
      organizationId,
      projectId,
      sourceFileId,
      targetLocales: "fr-FR",
      step: "proofread" as const,
      assigneeWorkosUserId: "user_1",
      title: "",
    };

    await runCreateTaskAction({ ...task, afterJobId: "job_post_edit" });
    expect(mocks.createWorkflowTaskJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ step: "proofread", afterJobId: "job_post_edit" }),
    );

    mocks.selectLimit.mockResolvedValueOnce([projectRow()]);
    await runCreateTaskAction({ ...task, afterJobId: "" });
    expect(mocks.createWorkflowTaskJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ afterJobId: undefined }),
    );

    mocks.selectLimit.mockResolvedValueOnce([projectRow()]);
    mocks.createWorkflowTaskJob.mockResolvedValue(
      err({ code: "after_job_not_found", message: "The task to come after was not found." }),
    );
    await expect(runCreateTaskAction({ ...task, afterJobId: "job_gone" })).resolves.toMatchObject({
      ok: false,
      error: { code: "after_job_not_found" },
    });
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

describe("runQaChecksAction", () => {
  beforeEach(() => {
    mocks.selectLimit.mockReset();
    mocks.runProjectTranslationQaScan.mockReset();
    mocks.getRepositorySourceFileVersionForStoredFile.mockReset();
  });

  it("scopes a clone job to the version it was made for, not main", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([
        {
          projectId,
          sourceFileId,
          branch: "feature-checkout",
          targetLocales: ["fr-FR"],
          repositorySourceFileId: "repo_file_clone",
        },
      ])
      .mockResolvedValueOnce([
        {
          errorCount: 0,
          warningCount: 0,
          findingCount: 0,
          summary: {},
        },
      ]);
    mocks.runProjectTranslationQaScan.mockResolvedValue({ ok: true, runId: "run_clone" });

    const result = await runQaChecksAction({
      organizationId,
      projectId,
      jobId: "job_clone_review",
    });

    expect(result).toMatchObject({
      ok: true,
      output: { runId: "run_clone", passed: true, targetLocales: ["fr-FR"] },
    });
    expect(mocks.getRepositorySourceFileVersionForStoredFile).not.toHaveBeenCalled();
    expect(mocks.runProjectTranslationQaScan).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId,
        scope: { repositorySourceFileId: "repo_file_clone", targetLocales: ["fr-FR"] },
      }),
    );
  });

  it("looks up a shared blob on the job's branch when no version is bound", async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([
        {
          projectId,
          sourceFileId,
          branch: "feature-checkout",
          targetLocales: ["de-DE"],
          repositorySourceFileId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          errorCount: 2,
          warningCount: 0,
          findingCount: 2,
          summary: {},
        },
      ]);
    mocks.getRepositorySourceFileVersionForStoredFile.mockResolvedValue({
      repositorySourceFileId: "repo_file_branch",
    });
    mocks.runProjectTranslationQaScan.mockResolvedValue({ ok: true, runId: "run_branch" });

    const result = await runQaChecksAction({
      organizationId,
      projectId,
      jobId: "job_branch",
    });

    expect(result).toMatchObject({
      ok: true,
      output: { runId: "run_branch", passed: false, errorCount: 2 },
    });
    expect(mocks.getRepositorySourceFileVersionForStoredFile).toHaveBeenCalledWith({
      organizationId,
      projectId,
      fileId: sourceFileId,
      branchName: "feature-checkout",
    });
    expect(mocks.runProjectTranslationQaScan).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { repositorySourceFileId: "repo_file_branch", targetLocales: ["de-DE"] },
      }),
    );
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

  it("counts a period from the moment the step runs", () => {
    const now = new Date("2026-11-19T08:00:00.000Z");
    expect(parseWorkflowDueAt("+3d", now)).toEqual(new Date("2026-11-22T08:00:00.000Z"));
    expect(parseWorkflowDueAt(" + 12 H ", now)).toEqual(new Date("2026-11-19T20:00:00.000Z"));
    // Not periods: no plus sign, nothing to count, another unit, or more than a period.
    for (const value of ["3d", "+0d", "+3w", "+d", "+1.5d", "+3d tomorrow", "-3d", "+3", "+12"]) {
      expect(parseWorkflowDueAt(value, now), value).toBeUndefined();
    }
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
