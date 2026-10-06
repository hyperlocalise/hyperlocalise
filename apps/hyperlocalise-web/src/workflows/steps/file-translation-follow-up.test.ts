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
    selectLimitMock.mockResolvedValue([
      { createdByUserId: "user_1", apiKeyId: null, ownerUserId: null },
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
