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

const { findLatestSucceededCommitAfterMock, resolveDefaultBranchHeadShaMock } = vi.hoisted(() => ({
  findLatestSucceededCommitAfterMock: vi.fn(),
  resolveDefaultBranchHeadShaMock: vi.fn(),
}));

vi.mock("./github-repository-automation-jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./github-repository-automation-jobs")>();
  return {
    ...actual,
    findLatestSucceededCommitAfter: (...args: unknown[]) =>
      findLatestSucceededCommitAfterMock(...args),
  };
});

vi.mock("./github-repository-automation-sandbox", () => ({
  resolveDefaultBranchHeadSha: (...args: unknown[]) => resolveDefaultBranchHeadShaMock(...args),
}));

import type { GithubRepositoryAutomationJobWithRepository } from "./github-repository-automation-jobs";
import { resolveGithubRepositoryAutomationCommitRange } from "./github-repository-automation-commit-range";

function job(
  overrides: Partial<GithubRepositoryAutomationJobWithRepository> = {},
): GithubRepositoryAutomationJobWithRepository {
  return {
    id: "job-1",
    idempotencyKey: "idem-1",
    organizationId: "org-1",
    githubInstallationRepositoryId: "repo-row-1",
    githubInstallationId: "12345",
    githubRepositoryId: "67890",
    configVersion: 1,
    triggerMode: "scheduled",
    status: "queued",
    skipReason: null,
    triggerBranch: "main",
    commitBefore: null,
    commitAfter: null,
    workflows: {
      pushSource: true,
      pullTranslations: false,
      validation: false,
      validationBlockOnFailure: true,
      statusCheck: { enabled: false, mode: "advisory" },
    },
    resultSummary: null,
    githubDeliveryId: null,
    scheduledRunAt: null,
    workflowRunId: null,
    githubCheckRunId: null,
    lastError: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    completedAt: null,
    organizationSlug: "acme",
    repositoryFullName: "acme/app",
    defaultBranch: "main",
    ...overrides,
  };
}

describe("resolveGithubRepositoryAutomationCommitRange", () => {
  beforeEach(() => {
    findLatestSucceededCommitAfterMock.mockReset();
    resolveDefaultBranchHeadShaMock.mockReset();
  });

  it("returns the job commit range when commitAfter is already set", async () => {
    await expect(
      resolveGithubRepositoryAutomationCommitRange(
        job({
          commitBefore: "aaa111",
          commitAfter: "bbb222",
        }),
      ),
    ).resolves.toEqual({
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });

    expect(resolveDefaultBranchHeadShaMock).not.toHaveBeenCalled();
    expect(findLatestSucceededCommitAfterMock).not.toHaveBeenCalled();
  });

  it("resolves head SHA and previous succeeded commit for scheduled jobs", async () => {
    resolveDefaultBranchHeadShaMock.mockResolvedValue({ branch: "main", sha: "head999" });
    findLatestSucceededCommitAfterMock.mockResolvedValue("prev888");

    await expect(resolveGithubRepositoryAutomationCommitRange(job())).resolves.toEqual({
      commitBefore: "prev888",
      commitAfter: "head999",
    });

    expect(resolveDefaultBranchHeadShaMock).toHaveBeenCalledWith({
      installationId: "12345",
      owner: "acme",
      repo: "app",
      branch: "main",
    });
    expect(findLatestSucceededCommitAfterMock).toHaveBeenCalledWith({
      githubInstallationRepositoryId: "repo-row-1",
      triggerBranch: "main",
    });
  });

  it("falls back to defaultBranch when triggerBranch is missing", async () => {
    resolveDefaultBranchHeadShaMock.mockResolvedValue({ branch: "develop", sha: "dev111" });
    findLatestSucceededCommitAfterMock.mockResolvedValue(null);

    await expect(
      resolveGithubRepositoryAutomationCommitRange(
        job({
          triggerBranch: null,
          defaultBranch: "develop",
        }),
      ),
    ).resolves.toEqual({
      commitBefore: null,
      commitAfter: "dev111",
    });

    expect(resolveDefaultBranchHeadShaMock).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "develop" }),
    );
    expect(findLatestSucceededCommitAfterMock).toHaveBeenCalledWith({
      githubInstallationRepositoryId: "repo-row-1",
      triggerBranch: "develop",
    });
  });

  it("throws when neither trigger nor default branch is available", async () => {
    await expect(
      resolveGithubRepositoryAutomationCommitRange(
        job({
          triggerBranch: null,
          defaultBranch: null,
        }),
      ),
    ).rejects.toThrow("github_repository_automation_branch_not_resolved");

    expect(resolveDefaultBranchHeadShaMock).not.toHaveBeenCalled();
  });

  it("throws when the repository full name is invalid", async () => {
    await expect(
      resolveGithubRepositoryAutomationCommitRange(
        job({
          repositoryFullName: "not-a-full-name",
        }),
      ),
    ).rejects.toThrow("invalid repository full name");

    expect(resolveDefaultBranchHeadShaMock).not.toHaveBeenCalled();
  });
});
