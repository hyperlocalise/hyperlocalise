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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { enqueueFileTranslationJobMock, selectLimitMock, createTranslationJobEventQueueMock } =
  vi.hoisted(() => ({
    enqueueFileTranslationJobMock: vi.fn(),
    selectLimitMock: vi.fn(),
    createTranslationJobEventQueueMock: vi.fn(() => ({ enqueue: vi.fn() })),
  }));

vi.mock("@/lib/projects/jobs/enqueue-file-translation-job", () => ({
  enqueueFileTranslationJob: (...args: unknown[]) => enqueueFileTranslationJobMock(...args),
}));

vi.mock("@/lib/workflow/queues", () => ({
  createTranslationJobEventQueue: () => createTranslationJobEventQueueMock(),
}));

vi.mock("@/lib/database/client", () => {
  const builder = {
    select: vi.fn(() => builder),
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: (...args: unknown[]) => selectLimitMock(...args),
  };
  return {
    db: builder,
    schema: {
      jobs: {
        id: "id",
        createdByUserId: "created_by_user_id",
        apiKeyId: "api_key_id",
        ownerUserId: "owner_user_id",
        assigneeType: "assignee_type",
        organizationId: "organization_id",
        projectId: "project_id",
        status: "status",
        inputPayload: "input_payload",
        createdAt: "created_at",
      },
    },
  };
});

import { enqueueFileTranslationFollowUpStep } from "./file-translation-follow-up";

describe("enqueueFileTranslationFollowUpStep", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a queued job for leftover locales from the original run", async () => {
    selectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { createdByUserId: "user_1", apiKeyId: null, ownerUserId: null, assigneeType: null },
      ]);
    enqueueFileTranslationJobMock.mockResolvedValue({ ok: true, jobId: "job_followup" });

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP", "ko-KR"],
        metadata: { sourcePath: "lang/en-US.json" },
      }),
    ).resolves.toEqual({ jobId: "job_followup" });

    expect(enqueueFileTranslationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        projectId: "project_1",
        createdByUserId: "user_1",
        assigneeType: null,
        sourceFileId: "file_1",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP", "ko-KR"],
        fileFormat: "json",
        metadata: expect.objectContaining({
          sourcePath: "lang/en-US.json",
          autoRetryAttempt: "1",
          parentJobId: "job_parent",
        }),
      }),
    );
  });

  it("copies an agent assignee from a parent with no human owner", async () => {
    selectLimitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        createdByUserId: "user_1",
        apiKeyId: null,
        ownerUserId: null,
        assigneeType: "agent",
      },
    ]);
    enqueueFileTranslationJobMock.mockResolvedValue({ ok: true, jobId: "job_followup" });

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toEqual({ jobId: "job_followup" });

    expect(enqueueFileTranslationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: null,
        assigneeType: "agent",
      }),
    );
  });

  it("reuses an existing follow-up instead of creating another job", async () => {
    const enqueueMock = vi.fn();
    createTranslationJobEventQueueMock.mockReturnValueOnce({ enqueue: enqueueMock });
    selectLimitMock.mockResolvedValueOnce([{ id: "job_existing_followup", status: "queued" }]);

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toEqual({ jobId: "job_existing_followup" });

    expect(enqueueFileTranslationJobMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_existing_followup",
        projectId: "project_1",
        type: "file",
      }),
    );
  });

  it("still enqueues when the parent job read fails", async () => {
    selectLimitMock.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("db unavailable"));
    enqueueFileTranslationJobMock.mockResolvedValue({ ok: true, jobId: "job_followup" });

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toEqual({ jobId: "job_followup" });

    expect(enqueueFileTranslationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        projectId: "project_1",
        createdByUserId: undefined,
        assigneeType: undefined,
      }),
    );
  });

  it("does not throw when follow-up lookup fails", async () => {
    selectLimitMock.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toBeNull();

    expect(enqueueFileTranslationJobMock).not.toHaveBeenCalled();
  });

  it("skips follow-up when the leftover file format is unsupported", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "not-a-format",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toBeNull();

    expect(enqueueFileTranslationJobMock).not.toHaveBeenCalled();
    expect(selectLimitMock).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[file-translation-workflow] follow-up skipped; unsupported file format",
      expect.objectContaining({
        parentJobId: "job_parent",
        fileFormat: "not-a-format",
      }),
    );
    consoleWarn.mockRestore();
  });

  it("reuses a running follow-up without creating or re-enqueueing another job", async () => {
    const enqueueMock = vi.fn();
    createTranslationJobEventQueueMock.mockReturnValueOnce({ enqueue: enqueueMock });
    selectLimitMock.mockResolvedValueOnce([{ id: "job_running_followup", status: "running" }]);

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toEqual({ jobId: "job_running_followup" });

    expect(enqueueFileTranslationJobMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("returns null when enqueueing a new follow-up job fails", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    selectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { createdByUserId: "user_1", apiKeyId: null, ownerUserId: null, assigneeType: "agent" },
      ]);
    enqueueFileTranslationJobMock.mockResolvedValue({ ok: false, code: "queue_unavailable" });

    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
      }),
    ).resolves.toBeNull();

    expect(consoleWarn).toHaveBeenCalledWith(
      "[file-translation-workflow] follow-up enqueue failed",
      expect.objectContaining({
        parentJobId: "job_parent",
        leftoverLocaleCount: 1,
        error: "queue_unavailable",
      }),
    );
    consoleWarn.mockRestore();
  });

  it("skips a second automatic retry", async () => {
    await expect(
      enqueueFileTranslationFollowUpStep({
        organizationId: "org_1",
        parentJobId: "job_parent",
        projectId: "project_1",
        sourceFileId: "file_1",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["ja-JP"],
        metadata: { autoRetryAttempt: "1" },
      }),
    ).resolves.toBeNull();

    expect(enqueueFileTranslationJobMock).not.toHaveBeenCalled();
  });
});
