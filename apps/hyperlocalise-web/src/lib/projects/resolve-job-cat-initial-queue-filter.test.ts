import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";

import { resolveJobCatInitialQueueFilter } from "./resolve-job-cat-initial-queue-filter";

const getOrganizationJobByIdMock = vi.fn();
const getTmsProviderLiveJobDetailMock = vi.fn();

vi.mock("@/lib/projects/jobs/organization-job-query-service", () => ({
  getOrganizationJobById: (...args: unknown[]) => getOrganizationJobByIdMock(...args),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  getTmsProviderLiveJobDetail: (...args: unknown[]) => getTmsProviderLiveJobDetailMock(...args),
}));

const auth = {
  user: { localUserId: "user_1" },
  organization: { localOrganizationId: "org_1" },
} as ApiAuthContext;

describe("resolveJobCatInitialQueueFilter", () => {
  beforeEach(() => {
    getOrganizationJobByIdMock.mockReset();
    getTmsProviderLiveJobDetailMock.mockReset();
  });

  it("returns the URL queue filter when present", async () => {
    await expect(
      resolveJobCatInitialQueueFilter({
        auth,
        jobId: "job_1",
        queueFilterParam: "needs_review",
      }),
    ).resolves.toBe("needs_review");
    expect(getOrganizationJobByIdMock).not.toHaveBeenCalled();
  });

  it("resolves the default from native job data when the URL param is missing", async () => {
    getOrganizationJobByIdMock.mockResolvedValue({
      kind: "translation",
      status: "waiting_for_review",
    });

    await expect(
      resolveJobCatInitialQueueFilter({
        auth,
        jobId: "job_1",
      }),
    ).resolves.toBe("needs_review");
  });

  it("resolves the default from provider live job data", async () => {
    getTmsProviderLiveJobDetailMock.mockResolvedValue({
      kind: "review",
      status: "running",
    });

    await expect(
      resolveJobCatInitialQueueFilter({
        auth,
        jobId: "ext:crowdin:project-1:job-1",
      }),
    ).resolves.toBe("needs_review");
    expect(getOrganizationJobByIdMock).not.toHaveBeenCalled();
  });

  it("falls back to untranslated when job data is unavailable", async () => {
    getOrganizationJobByIdMock.mockResolvedValue(null);

    await expect(
      resolveJobCatInitialQueueFilter({
        auth,
        jobId: "job_missing",
      }),
    ).resolves.toBe("untranslated");
  });

  it("falls back to untranslated when provider job lookup throws", async () => {
    getTmsProviderLiveJobDetailMock.mockRejectedValue(new Error("provider_fetcher_unavailable"));

    await expect(
      resolveJobCatInitialQueueFilter({
        auth,
        jobId: "ext:crowdin:project-1:job-1",
      }),
    ).resolves.toBe("untranslated");
  });
});
