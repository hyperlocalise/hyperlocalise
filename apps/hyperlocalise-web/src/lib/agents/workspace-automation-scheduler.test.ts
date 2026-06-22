import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

import { buildWorkspaceOrchestratorPlan } from "@/agents/automations/workspace/agent/plan";

import { dispatchDueContentfulWorkspaceAutomations } from "./workspace-automation-dispatcher";
import { runWorkspaceAutomationScheduler } from "./workspace-automation-scheduler";
import * as workspaceAutomations from "./workspace-automations";
import * as workspaceAutomationDispatcher from "./workspace-automation-dispatcher";

vi.mock("@/agents/automations/workspace/agent/plan", () => ({
  buildWorkspaceOrchestratorPlan: vi.fn(() => ({ tools: ["run_contentful_translation"] })),
}));

describe("runWorkspaceAutomationScheduler", () => {
  beforeEach(() => {
    vi.mocked(buildWorkspaceOrchestratorPlan).mockReturnValue({
      tools: ["run_contentful_translation"],
    });
  });

  it("skips contentful dispatch for automations already due on a GitHub repository", async () => {
    const scheduledRunAt = new Date("2026-06-01T08:00:00.000Z");
    const automation = {
      id: "automation-contentful-github",
      organizationId: "org-1",
      authorUserId: null,
      status: "active" as const,
      name: "Scheduled Contentful on GitHub repo",
      instructions: "",
      triggerConfig: {
        mode: "scheduled" as const,
        schedule: { cadence: "daily" as const, hourUtc: 8, timezone: "UTC" },
      },
      repositoryTarget: {
        kind: "github" as const,
        githubInstallationRepositoryId: "repo-1",
      },
      toolConfig: {
        contentful: {
          enabled: true,
          connectionId: "conn-1",
          projectId: "project-1",
          sourceLocale: "en",
          targetLocales: ["de"],
          contentTypeIds: [],
          fieldMode: "auto" as const,
          overwriteDraftLocales: false,
          runQa: true,
          writeDrafts: true,
        },
        github: {
          enabled: true,
          mode: "agent" as const,
          projectId: "project-1",
          pushSource: false,
          pullTranslations: false,
          validation: false,
        },
      },
      configVersion: 1,
      nextRunAt: scheduledRunAt.toISOString(),
      createdAt: scheduledRunAt.toISOString(),
      updatedAt: scheduledRunAt.toISOString(),
    };

    vi.spyOn(workspaceAutomations, "listDueWorkspaceAutomations").mockResolvedValue([
      {
        automation,
        repository: {
          id: "repo-1",
          organizationId: "org-1",
          githubInstallationId: "install-1",
          githubRepositoryId: "12345",
          owner: "hyperlocalise",
          name: "web",
          fullName: "hyperlocalise/web",
          private: false,
          archived: false,
          defaultBranch: "main",
          enabled: true,
          createdAt: scheduledRunAt,
          updatedAt: scheduledRunAt,
        },
      },
    ]);

    const dispatchDueContentfulWorkspaceAutomations = vi
      .spyOn(workspaceAutomationDispatcher, "dispatchDueContentfulWorkspaceAutomations")
      .mockResolvedValue([]);

    vi.spyOn(
      workspaceAutomationDispatcher,
      "dispatchWorkspaceAutomationForScheduleAndAdvance",
    ).mockResolvedValue({
      outcome: "enqueued",
      runId: "run-1",
      inserted: true,
    });

    await runWorkspaceAutomationScheduler({ now: scheduledRunAt });

    expect(dispatchDueContentfulWorkspaceAutomations).toHaveBeenCalledWith({
      now: scheduledRunAt,
      limit: undefined,
      skipAutomationIds: new Set(["automation-contentful-github"]),
    });
  });
});

describe("dispatchDueContentfulWorkspaceAutomations", () => {
  it("does not dispatch automations listed in skipAutomationIds", async () => {
    const scheduledRunAt = new Date("2026-06-01T08:00:00.000Z");
    const automation = {
      id: "automation-1",
      organizationId: "org-1",
      authorUserId: null,
      status: "active" as const,
      name: "Contentful only",
      instructions: "",
      triggerConfig: {
        mode: "scheduled" as const,
        schedule: { cadence: "daily" as const, hourUtc: 8, timezone: "UTC" },
      },
      repositoryTarget: { kind: "none" as const },
      toolConfig: {
        contentful: {
          enabled: true,
          connectionId: "conn-1",
          projectId: "project-1",
          sourceLocale: "en",
          targetLocales: ["de"],
          contentTypeIds: [],
          fieldMode: "auto" as const,
          overwriteDraftLocales: false,
          runQa: true,
          writeDrafts: true,
        },
      },
      configVersion: 1,
      nextRunAt: scheduledRunAt.toISOString(),
      createdAt: scheduledRunAt.toISOString(),
      updatedAt: scheduledRunAt.toISOString(),
    };

    vi.spyOn(workspaceAutomations, "listDueContentfulWorkspaceAutomations").mockResolvedValue([
      automation,
    ]);

    const dispatchWorkspaceAutomationForSchedule = vi
      .spyOn(workspaceAutomationDispatcher, "dispatchWorkspaceAutomationForSchedule")
      .mockResolvedValue({
        outcome: "enqueued",
        runId: "run-1",
        inserted: true,
      });

    const advanceWorkspaceAutomationNextRun = vi
      .spyOn(workspaceAutomations, "advanceWorkspaceAutomationNextRun")
      .mockResolvedValue();

    const results = await dispatchDueContentfulWorkspaceAutomations({
      now: scheduledRunAt,
      skipAutomationIds: new Set(["automation-1"]),
    });

    expect(results).toEqual([]);
    expect(dispatchWorkspaceAutomationForSchedule).not.toHaveBeenCalled();
    expect(advanceWorkspaceAutomationNextRun).not.toHaveBeenCalled();
  });
});
