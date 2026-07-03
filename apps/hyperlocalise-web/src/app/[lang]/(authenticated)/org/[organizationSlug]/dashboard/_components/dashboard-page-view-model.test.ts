import { describe, expect, it } from "vite-plus/test";

import type { ApiJob } from "../../jobs/_components/jobs-page-view";
import {
  isDashboardSetupComplete,
  resolveDashboardHero,
  resolveDashboardIntegrations,
  resolveWorkspacePendingActionCount,
  sortDashboardJobs,
} from "./dashboard-page-view-model";

describe("dashboard-page-view-model", () => {
  it("prioritizes actionable jobs before succeeded work", () => {
    const jobs = sortDashboardJobs([
      { status: "succeeded", updatedAt: "2026-03-20T00:00:00.000Z" },
      { status: "waiting_for_review", updatedAt: "2026-03-18T00:00:00.000Z" },
      { status: "failed", updatedAt: "2026-03-19T00:00:00.000Z" },
    ] as ApiJob[]);

    expect(jobs.map((job) => job.status)).toEqual(["waiting_for_review", "failed", "succeeded"]);
  });

  it("treats setup as complete only when integrations and projects exist", () => {
    const integrations = resolveDashboardIntegrations({
      tmsConnected: true,
      githubConnected: true,
      slackConnected: true,
    });

    expect(isDashboardSetupComplete(integrations, 0)).toBe(false);
    expect(isDashboardSetupComplete(integrations, 2)).toBe(true);
  });

  it("builds setup hero before workspace is ready", () => {
    const integrations = resolveDashboardIntegrations({
      tmsConnected: false,
      githubConnected: false,
      slackConnected: false,
    });

    const hero = resolveDashboardHero({
      integrations,
      projectCount: 0,
      pendingCount: 0,
      integrationsHref: "/org/acme/integrations",
      myJobsHref: "/org/acme/my-jobs",
      newRequestHref: "/org/acme/chat",
    });

    expect(hero.mode).toBe("setup");
    if (hero.mode === "setup") {
      expect(hero.connectedCount).toBe(0);
    }
  });

  it("counts pending actions from open jobs and assigned review failures", () => {
    const pendingCount = resolveWorkspacePendingActionCount({
      projects: [{ openJobCount: 2 }, { openJobCount: 1 }],
      jobs: [
        { status: "waiting_for_review" },
        { status: "failed" },
        { status: "succeeded" },
      ] as ApiJob[],
    });

    expect(pendingCount).toBe(5);
  });
});
