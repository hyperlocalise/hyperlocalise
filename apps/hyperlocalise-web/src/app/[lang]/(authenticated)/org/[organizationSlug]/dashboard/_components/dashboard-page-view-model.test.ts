import { describe, expect, it } from "vite-plus/test";

import type { ApiJob } from "../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../projects/_components/project-list";
import {
  isDashboardSetupComplete,
  mergeDashboardJobSources,
  mergeDashboardProjectSources,
  resolveDashboardHero,
  resolveDashboardIntegrations,
  resolveWorkspacePendingActionCount,
  sortDashboardJobs,
  sortDashboardLatestJobs,
  sortDashboardProjects,
} from "./dashboard-page-view-model";

describe("dashboard-page-view-model", () => {
  it("merges native and live TMS jobs without duplicate resource IDs", () => {
    const jobs = mergeDashboardJobSources(
      [{ id: "native-job", updatedAt: "2026-03-18T00:00:00.000Z" }],
      [
        { id: "ext:crowdin:100:200", updatedAt: "2026-03-20T00:00:00.000Z" },
        { id: "native-job", updatedAt: "2026-03-21T00:00:00.000Z" },
      ],
    );

    expect(jobs).toEqual([
      { id: "native-job", updatedAt: "2026-03-21T00:00:00.000Z" },
      { id: "ext:crowdin:100:200", updatedAt: "2026-03-20T00:00:00.000Z" },
    ]);
  });

  it("merges native and live TMS projects", () => {
    const projects = mergeDashboardProjectSources(
      [{ id: "native-project", source: "native" }] as ProjectListRow[],
      [{ id: "ext:crowdin:100", source: "external_tms" }] as ProjectListRow[],
    );

    expect(projects.map((project) => [project.id, project.source])).toEqual([
      ["native-project", "native"],
      ["ext:crowdin:100", "external_tms"],
    ]);
  });

  it("prioritizes actionable jobs before succeeded work", () => {
    const jobs = sortDashboardJobs([
      { status: "succeeded", updatedAt: "2026-03-20T00:00:00.000Z" },
      { status: "waiting_for_review", updatedAt: "2026-03-18T00:00:00.000Z" },
      { status: "failed", updatedAt: "2026-03-19T00:00:00.000Z" },
    ] as ApiJob[]);

    expect(jobs.map((job) => job.status)).toEqual(["waiting_for_review", "failed", "succeeded"]);
  });

  it("orders latest jobs by update time without status priority", () => {
    const jobs = sortDashboardLatestJobs([
      { status: "waiting_for_review", updatedAt: "2026-03-18T00:00:00.000Z" },
      { status: "succeeded", updatedAt: "2026-03-20T00:00:00.000Z" },
    ] as ApiJob[]);

    expect(jobs.map((job) => job.status)).toEqual(["succeeded", "waiting_for_review"]);
  });

  it("puts locally visited projects before activity-ranked projects", () => {
    const projects = sortDashboardProjects(
      [
        {
          id: "busy",
          openJobCount: 5,
          updated: "Mar 20, 2026, 11:00 AM",
          lastSyncedAt: null,
        },
        {
          id: "visited",
          openJobCount: 0,
          updated: "Mar 18, 2026, 11:00 AM",
          lastSyncedAt: null,
        },
      ] as unknown as ProjectListRow[],
      [{ projectId: "visited", visitedAt: 100 }],
    );

    expect(projects.map((project) => project.id)).toEqual(["visited", "busy"]);
  });

  it("treats setup as complete only when integrations and projects exist", () => {
    const integrations = resolveDashboardIntegrations({
      tmsConnected: true,
      tmsProviderKind: "crowdin",
      tmsProviderName: "Crowdin",
      githubConnected: true,
      slackConnected: true,
    });

    expect(integrations[0]).toMatchObject({
      label: "Crowdin",
      providerKind: "crowdin",
      connected: true,
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
      expect(hero.completedCount).toBe(0);
      expect(hero.totalCount).toBe(4);
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
