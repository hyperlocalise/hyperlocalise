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

import { ok } from "@/lib/primitives/result/results";

const {
  getStoredFileForJobScopeMock,
  ensureRepositorySourceFileVersionForStoredFileMock,
  validateJobLocalesAgainstProjectMock,
  assertOrganizationCanEnqueueTranslationJobInTransactionMock,
  reserveUsageEventMock,
  selectLimitMock,
  transactionMock,
  jobQueueEnqueueMock,
} = vi.hoisted(() => ({
  getStoredFileForJobScopeMock: vi.fn(),
  ensureRepositorySourceFileVersionForStoredFileMock: vi.fn(),
  validateJobLocalesAgainstProjectMock: vi.fn(),
  assertOrganizationCanEnqueueTranslationJobInTransactionMock: vi.fn(),
  reserveUsageEventMock: vi.fn(),
  selectLimitMock: vi.fn(),
  transactionMock: vi.fn(),
  jobQueueEnqueueMock: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getStoredFileForJobScope: (...args: unknown[]) => getStoredFileForJobScopeMock(...args),
  ensureRepositorySourceFileVersionForStoredFile: (...args: unknown[]) =>
    ensureRepositorySourceFileVersionForStoredFileMock(...args),
}));

vi.mock("@/lib/i18n/project-job-locales", () => ({
  validateJobLocalesAgainstProject: (...args: unknown[]) =>
    validateJobLocalesAgainstProjectMock(...args),
}));

vi.mock("@/lib/security/organization-operation-budget", () => ({
  assertOrganizationCanEnqueueTranslationJobInTransaction: (...args: unknown[]) =>
    assertOrganizationCanEnqueueTranslationJobInTransactionMock(...args),
  OrganizationJobBudgetExceededError: class OrganizationJobBudgetExceededError extends Error {
    budgetError: { code: string; message: string };
    constructor(budgetError: { code: string; message: string }) {
      super(budgetError.message);
      this.budgetError = budgetError;
    }
  },
}));

vi.mock("@/lib/billing/usage-control", () => ({
  reserveUsageEvent: (...args: unknown[]) => reserveUsageEventMock(...args),
  formatUsageControlError: (error: { code: string }) => error.code,
  usageFeatureIds: { translationJobs: "translation_jobs" },
}));

vi.mock("@/lib/database", () => {
  const createSelectBuilder = () => {
    const builder = {
      from: vi.fn(() => builder),
      leftJoin: vi.fn(() => builder),
      where: vi.fn(() => builder),
      limit: selectLimitMock,
    };
    return builder;
  };

  return {
    db: {
      select: vi.fn(() => createSelectBuilder()),
      transaction: (...args: unknown[]) => transactionMock(...args),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(),
        })),
      })),
    },
    schema: {
      projects: {
        id: "id",
        organizationId: "organizationId",
        source: "source",
        sourceLocale: "sourceLocale",
        targetLocales: "targetLocales",
      },
      jobs: {
        id: "id",
        projectId: "projectId",
        organizationId: "organizationId",
        kind: "kind",
        status: "status",
      },
      translationJobDetails: {
        jobId: "jobId",
        type: "type",
      },
      externalJobDetails: {
        jobId: "jobId",
        providerKind: "providerKind",
      },
    },
  };
});

import {
  buildNativeFileTranslationJobTitle,
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
  enqueueFileTranslationJob,
  mergeNativeFileTranslationJobMetadata,
} from "./enqueue-file-translation-job";

describe("buildNativeFileTranslationJobTitle", () => {
  it("formats filename with a UTC timestamp", () => {
    expect(
      buildNativeFileTranslationJobTitle("messages.json", new Date("2026-07-31T22:11:45.000Z")),
    ).toBe("messages.json · 2026-07-31 22:11");
  });

  it("falls back when filename is blank", () => {
    expect(buildNativeFileTranslationJobTitle("   ", new Date("2026-01-02T03:04:00.000Z"))).toBe(
      "file · 2026-01-02 03:04",
    );
  });
});

describe("mergeNativeFileTranslationJobMetadata", () => {
  it("defaults title from filename and keeps caller fields", () => {
    expect(
      mergeNativeFileTranslationJobMetadata(
        "messages.json",
        { instructions: "Keep brand names" },
        new Date("2026-07-31T22:11:45.000Z"),
      ),
    ).toEqual({
      title: "messages.json · 2026-07-31 22:11",
      instructions: "Keep brand names",
    });
  });

  it("keeps a caller-supplied title", () => {
    expect(
      mergeNativeFileTranslationJobMetadata(
        "messages.json",
        { title: "Release notes · JP + KO" },
        new Date("2026-07-31T22:11:45.000Z"),
      ),
    ).toEqual({
      title: "Release notes · JP + KO",
    });
  });
});

describe("enqueueFileTranslationJob", () => {
  let capturedJobValues: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedJobValues = null;
    validateJobLocalesAgainstProjectMock.mockReturnValue(ok(undefined));
    assertOrganizationCanEnqueueTranslationJobInTransactionMock.mockResolvedValue(ok(undefined));
    reserveUsageEventMock.mockResolvedValue(ok(undefined));
    ensureRepositorySourceFileVersionForStoredFileMock.mockResolvedValue({ id: "version_1" });
    jobQueueEnqueueMock.mockResolvedValue(undefined);
    selectLimitMock.mockResolvedValue([
      {
        id: "project_1",
        source: "repository",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    ]);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn(),
      };
      // First insert returns the job; second insert is translationJobDetails (no returning).
      let insertCount = 0;
      tx.insert = vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertCount += 1;
          if (insertCount === 1) {
            capturedJobValues = values;
            return {
              returning: vi.fn().mockResolvedValue([{ id: "job_test", projectId: "project_1" }]),
            };
          }
          return {
            returning: vi.fn().mockResolvedValue([]),
          };
        }),
      }));
      return fn(tx);
    });
  });

  it("accepts png source files for image translation jobs", async () => {
    getStoredFileForJobScopeMock.mockResolvedValue({
      id: "file_png",
      filename: "banner.png",
    });

    const result = await enqueueFileTranslationJob({
      organizationId: "org_1",
      projectId: "project_1",
      sourceFileId: "file_png",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fileFormat: "png",
      jobQueue: { enqueue: jobQueueEnqueueMock } as never,
    });

    expect(result).toEqual({ ok: true, jobId: "job_test" });
    expect(jobQueueEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "translation",
        type: "file",
        jobId: "job_test",
      }),
    );
  });

  it("sets a human-readable metadata title from filename and UTC time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T22:11:45.000Z"));
    getStoredFileForJobScopeMock.mockResolvedValue({
      id: "file_json",
      filename: "messages.json",
    });

    try {
      const result = await createFileTranslationJob({
        organizationId: "org_1",
        projectId: "project_1",
        sourceFileId: "file_json",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
      });

      expect(result).toEqual({
        ok: true,
        jobId: "job_test",
        projectId: "project_1",
        sourceFileVersionId: "version_1",
      });
      expect(capturedJobValues?.inputPayload).toEqual({
        sourceFileId: "file_json",
        fileFormat: "json",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        metadata: {
          title: "messages.json · 2026-07-31 22:11",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a caller-supplied metadata title", async () => {
    getStoredFileForJobScopeMock.mockResolvedValue({
      id: "file_json",
      filename: "messages.json",
    });

    const result = await createFileTranslationJob({
      organizationId: "org_1",
      projectId: "project_1",
      sourceFileId: "file_json",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fileFormat: "json",
      metadata: { title: "Release notes · JP + KO" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(capturedJobValues?.inputPayload).toMatchObject({
      metadata: { title: "Release notes · JP + KO" },
    });
  });

  it("rejects unsupported source file formats", async () => {
    getStoredFileForJobScopeMock.mockResolvedValue({
      id: "file_pdf",
      filename: "brief.pdf",
    });

    const result = await enqueueFileTranslationJob({
      organizationId: "org_1",
      projectId: "project_1",
      sourceFileId: "file_pdf",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      jobQueue: { enqueue: jobQueueEnqueueMock } as never,
    });

    expect(result).toEqual({
      ok: false,
      code: "unsupported_source_file_format",
      message: "Unsupported source file format.",
    });
    expect(jobQueueEnqueueMock).not.toHaveBeenCalled();
  });
});

describe("enqueueExistingFileTranslationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobQueueEnqueueMock.mockResolvedValue(undefined);
  });

  it("rejects non-queued terminal job statuses", async () => {
    selectLimitMock.mockResolvedValue([
      {
        id: "job_failed",
        projectId: "project_1",
        kind: "translation",
        status: "failed",
        type: "file",
        externalProviderKind: null,
      },
    ]);

    const result = await enqueueExistingFileTranslationJob({
      organizationId: "org_1",
      jobId: "job_failed",
      jobQueue: { enqueue: jobQueueEnqueueMock } as never,
    });

    expect(result).toEqual({
      ok: false,
      code: "job_not_enqueueable",
      message: 'Job status "failed" cannot be assigned to the translation agent.',
    });
    expect(jobQueueEnqueueMock).not.toHaveBeenCalled();
  });

  it("enqueues queued native file translation jobs", async () => {
    selectLimitMock.mockResolvedValue([
      {
        id: "job_queued",
        projectId: "project_1",
        kind: "translation",
        status: "queued",
        type: "file",
        externalProviderKind: null,
      },
    ]);

    const result = await enqueueExistingFileTranslationJob({
      organizationId: "org_1",
      jobId: "job_queued",
      jobQueue: { enqueue: jobQueueEnqueueMock } as never,
    });

    expect(result).toEqual({
      ok: true,
      jobId: "job_queued",
      projectId: "project_1",
    });
    expect(jobQueueEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "translation",
        type: "file",
        jobId: "job_queued",
      }),
    );
  });
});
