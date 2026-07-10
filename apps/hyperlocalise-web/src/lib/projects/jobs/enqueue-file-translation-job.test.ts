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

vi.mock("@/lib/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: selectLimitMock,
        })),
      })),
    })),
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
    },
    translationJobDetails: {},
  },
}));

import { enqueueFileTranslationJob } from "./enqueue-file-translation-job";

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
