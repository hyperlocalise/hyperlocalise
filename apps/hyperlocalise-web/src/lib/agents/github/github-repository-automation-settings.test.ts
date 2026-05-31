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
        validation: { enabled: false, blockOnFailure: true },
      },
      trigger: null,
      statusCheck: { enabled: false, mode: "blocking" },
    });
  });

  it("requires a trigger when any workflow is enabled", () => {
    expect(
      validateGithubRepositoryAutomationSettings({
        workflows: {
          pushSource: { enabled: true },
          pullTranslations: { enabled: false },
          validation: { enabled: false, blockOnFailure: true },
        },
        trigger: null,
        statusCheck: { enabled: false, mode: "blocking" },
      }),
    ).toBe("automation_trigger_required");
  });

  it("requires branch patterns for push triggers", () => {
    expect(
      validateGithubRepositoryAutomationSettings({
        workflows: {
          pushSource: { enabled: true },
          pullTranslations: { enabled: false },
          validation: { enabled: false, blockOnFailure: true },
        },
        trigger: { mode: "push", branches: [] },
        statusCheck: { enabled: false, mode: "blocking" },
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
        validationBlockOnFailure: true,
        statusCheck: { enabled: false, mode: "blocking" },
      },
      pushBranch: "release/2.0",
    });
  });

  it("includes validation and status check behavior when enabled", () => {
    const settings = mergeGithubRepositoryAutomationSettings(
      DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
      {
        workflows: {
          validation: { enabled: true, blockOnFailure: false },
        },
        statusCheck: { enabled: true, mode: "advisory" },
        trigger: { mode: "push", branches: ["main"] },
      },
    );

    const payload = buildGithubRepoAutomationDispatchPayload({
      configVersion: 1,
      githubInstallationRepositoryId: "repo-row-id",
      organizationId: "org-id",
      githubRepositoryId: "101",
      githubInstallationId: "987654",
      settings,
      pushBranch: "main",
    });

    expect(payload?.workflows.validationBlockOnFailure).toBe(false);
    expect(payload?.workflows.statusCheck).toEqual({ enabled: true, mode: "advisory" });
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

  it("schedules weekly runs in the future when local weekday is behind UTC", () => {
    const from = new Date("2026-01-05T02:00:00.000Z");
    const next = computeNextScheduledRunAt(
      {
        mode: "scheduled",
        cadence: "weekly",
        hourUtc: 1,
        timezone: "America/New_York",
        dayOfWeek: 1,
      },
      from,
    );

    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(next.toISOString()).toBe("2026-01-12T01:00:00.000Z");
  });
});
