import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

const listDueWorkspaceAutomations = vi.fn();
const dispatchDueContentfulWorkspaceAutomations = vi.fn();
const dispatchWorkspaceAutomationForScheduleAndAdvance = vi.fn();
const buildWorkspaceOrchestratorPlan = vi.fn();

vi.mock("./workspace-automations", () => ({
  listDueWorkspaceAutomations: (...args: unknown[]) => listDueWorkspaceAutomations(...args),
}));

vi.mock("./workspace-automation-dispatcher", () => ({
  dispatchDueContentfulWorkspaceAutomations: (...args: unknown[]) =>
    dispatchDueContentfulWorkspaceAutomations(...args),
  dispatchWorkspaceAutomationForScheduleAndAdvance: (...args: unknown[]) =>
    dispatchWorkspaceAutomationForScheduleAndAdvance(...args),
}));

vi.mock("@/agents/automations/workspace/agent/plan", () => ({
  buildWorkspaceOrchestratorPlan: (...args: unknown[]) => buildWorkspaceOrchestratorPlan(...args),
}));

import { runWorkspaceAutomationScheduler } from "./workspace-automation-scheduler";

describe("runWorkspaceAutomationScheduler", () => {
  beforeEach(() => {
    listDueWorkspaceAutomations.mockReset();
    dispatchDueContentfulWorkspaceAutomations.mockReset();
    dispatchWorkspaceAutomationForScheduleAndAdvance.mockReset();
    buildWorkspaceOrchestratorPlan.mockReset();
    buildWorkspaceOrchestratorPlan.mockReturnValue({
      tools: ["run_contentful_translation"],
    });
    dispatchDueContentfulWorkspaceAutomations.mockResolvedValue([]);
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

    listDueWorkspaceAutomations.mockResolvedValue([
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

    dispatchWorkspaceAutomationForScheduleAndAdvance.mockResolvedValue({
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
    expect(dispatchWorkspaceAutomationForScheduleAndAdvance).toHaveBeenCalledTimes(1);
  });
});
