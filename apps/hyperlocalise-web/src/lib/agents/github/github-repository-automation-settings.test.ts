import { describe, expect, it } from "vite-plus/test";

import {
  branchMatchesAutomationPatterns,
  buildGithubRepoAutomationDispatchPayload,
  computeNextScheduledRunAt,
  DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
  mergeGithubRepositoryAutomationSettings,
  resolveNextRunAtForSettings,
  shouldRunAutomationForPushBranch,
  validateGithubRepositoryAutomationSettings,
} from "./github-repository-automation-settings";

describe("github repository automation settings", () => {
  it("uses safe defaults when no overrides exist", () => {
    expect(DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS).toEqual({
      workflows: {
        pushSource: { enabled: false },
        pullTranslations: { enabled: false },
        validation: { enabled: false },
      },
      trigger: null,
    });
  });

  it("requires a trigger when any workflow is enabled", () => {
    expect(
      validateGithubRepositoryAutomationSettings({
        workflows: {
          pushSource: { enabled: true },
          pullTranslations: { enabled: false },
          validation: { enabled: false },
        },
        trigger: null,
      }),
    ).toBe("automation_trigger_required");
  });

  it("requires branch patterns for push triggers", () => {
    expect(
      validateGithubRepositoryAutomationSettings({
        workflows: {
          pushSource: { enabled: true },
          pullTranslations: { enabled: false },
          validation: { enabled: false },
        },
        trigger: { mode: "push", branches: [] },
      }),
    ).toBe("push_trigger_requires_branches");
  });

  it("matches branch glob patterns without crossing path separators", () => {
    expect(branchMatchesAutomationPatterns("main", ["main"])).toBe(true);
    expect(branchMatchesAutomationPatterns("release/1.2", ["release/*"])).toBe(true);
    expect(branchMatchesAutomationPatterns("release/1.2/beta", ["release/*"])).toBe(false);
    expect(branchMatchesAutomationPatterns("release/1.2/beta", ["release/**"])).toBe(true);
    expect(branchMatchesAutomationPatterns("feature/foo", ["release/*"])).toBe(false);
  });

  it("builds idempotent dispatch payloads for push triggers", () => {
    const settings = mergeGithubRepositoryAutomationSettings(
      DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
      {
        workflows: {
          pushSource: { enabled: true },
          pullTranslations: { enabled: true },
          validation: { enabled: false },
        },
        trigger: { mode: "push", branches: ["main", "release/*"] },
      },
    );

    expect(shouldRunAutomationForPushBranch(settings, "release/2.0")).toBe(true);
    expect(
      buildGithubRepoAutomationDispatchPayload({
        configVersion: 3,
        githubInstallationRepositoryId: "repo-row-id",
        organizationId: "org-id",
        githubRepositoryId: "101",
        githubInstallationId: "987654",
        settings,
        pushBranch: "release/2.0",
      }),
    ).toEqual({
      configVersion: 3,
      githubInstallationRepositoryId: "repo-row-id",
      organizationId: "org-id",
      githubRepositoryId: "101",
      githubInstallationId: "987654",
      triggerMode: "push",
      workflows: {
        pushSource: true,
        pullTranslations: true,
        validation: false,
      },
      pushBranch: "release/2.0",
    });
  });

  it("computes the next scheduled run in the future", () => {
    const from = new Date("2026-05-30T10:15:00.000Z");
    const next = computeNextScheduledRunAt(
      {
        mode: "scheduled",
        cadence: "daily",
        hourUtc: 12,
        timezone: "UTC",
      },
      from,
    );

    expect(next.toISOString()).toBe("2026-05-30T12:00:00.000Z");
    expect(
      resolveNextRunAtForSettings(
        mergeGithubRepositoryAutomationSettings(DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS, {
          workflows: { validation: { enabled: true } },
          trigger: {
            mode: "scheduled",
            cadence: "hourly",
            hourUtc: 0,
            timezone: "UTC",
          },
        }),
        from,
      )?.toISOString(),
    ).toBe("2026-05-30T11:00:00.000Z");
  });

  it("schedules daily runs at hourUtc in UTC", () => {
    const from = new Date("2026-05-30T14:00:00.000Z");
    const next = computeNextScheduledRunAt(
      {
        mode: "scheduled",
        cadence: "daily",
        hourUtc: 9,
        timezone: "America/New_York",
      },
      from,
    );

    expect(next.toISOString()).toBe("2026-05-31T09:00:00.000Z");
  });
});
