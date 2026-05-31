import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildGithubRepositoryAutomationJobDetailsUrl,
  resolveGithubAutomationCheckConclusion,
} from "./github-repository-automation-check-run";

describe("github repository automation check run conclusions", () => {
  it("fails blocking checks when automation fails", () => {
    expect(
      resolveGithubAutomationCheckConclusion({ statusCheckMode: "blocking", status: "failed" }),
    ).toBe("failure");
  });

  it("keeps advisory checks neutral when automation fails", () => {
    expect(
      resolveGithubAutomationCheckConclusion({ statusCheckMode: "advisory", status: "failed" }),
    ).toBe("neutral");
  });

  it("resolves successful automation explicitly", () => {
    expect(
      resolveGithubAutomationCheckConclusion({ statusCheckMode: "blocking", status: "succeeded" }),
    ).toBe("success");
  });

  it("resolves skipped automation explicitly", () => {
    expect(
      resolveGithubAutomationCheckConclusion({ statusCheckMode: "blocking", status: "skipped" }),
    ).toBe("skipped");
  });
});

describe("github repository automation check runs", () => {
  it("returns the org integrations page with job context", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        HYPERLOCALISE_PUBLIC_APP_URL: "https://app.example.com",
      },
    }));

    const { buildGithubRepositoryAutomationJobDetailsUrl: buildUrl } =
      await import("./github-repository-automation-check-run");

    expect(
      buildUrl({
        organizationSlug: "acme",
        githubRepositoryId: "12345",
        jobId: "job-uuid",
      }),
    ).toBe(
      "https://app.example.com/org/acme/integrations?githubRepositoryId=12345&automationJobId=job-uuid",
    );
  });

  it("returns undefined when the public app URL or org slug is missing", () => {
    expect(
      buildGithubRepositoryAutomationJobDetailsUrl({
        organizationSlug: null,
        githubRepositoryId: "12345",
        jobId: "job-uuid",
      }),
    ).toBeUndefined();
  });
});

describe("check run constants", () => {
  it("uses a localization automation context suitable for branch protection", async () => {
    vi.resetModules();
    const checksCreate = vi.fn().mockResolvedValue({ data: { id: 123 } });
    vi.doMock("@/lib/agents/github/app", () => ({
      getInstallationOctokit: vi.fn().mockResolvedValue({
        rest: { checks: { create: checksCreate } },
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { HYPERLOCALISE_PUBLIC_APP_URL: "https://app.example.com" },
    }));

    const { createGithubRepositoryAutomationCheckRun } =
      await import("./github-repository-automation-check-run");

    await expect(
      createGithubRepositoryAutomationCheckRun({
        installationId: "987",
        repositoryFullName: "acme/repo",
        headSha: "abc123",
        organizationSlug: "acme",
        githubRepositoryId: "101",
        jobId: "job-uuid",
      }),
    ).resolves.toBe("123");

    expect(checksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Hyperlocalise localization validation",
        head_sha: "abc123",
        status: "in_progress",
        external_id: "job-uuid",
      }),
    );
  });
});
