import { describe, expect, it, vi } from "vite-plus/test";

import { buildGithubRepositoryAutomationJobDetailsUrl } from "./github-repository-automation-check-run";

describe("buildGithubRepositoryAutomationJobDetailsUrl", () => {
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
