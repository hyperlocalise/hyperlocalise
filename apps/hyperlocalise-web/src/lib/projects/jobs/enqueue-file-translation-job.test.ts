/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
  enqueueExistingFileTranslationJob,
  enqueueFileTranslationJob,
} from "./enqueue-file-translation-job";

describe("enqueueFileTranslationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "job_test", projectId: "project_1" }]),
          })),
        })),
      };
      // First insert returns the job; second insert is translationJobDetails (no returning).
      let insertCount = 0;
      tx.insert = vi.fn(() => ({
        values: vi.fn(() => {
          insertCount += 1;
          if (insertCount === 1) {
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
