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
import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

const listDueWorkspaceAutomations = vi.fn();
const repairMissingScheduledWorkspaceAutomationNextRuns = vi.fn();
const dispatchDueContentfulWorkspaceAutomations = vi.fn();
const dispatchWorkspaceAutomationForScheduleAndAdvance = vi.fn();
const buildWorkspaceOrchestratorPlan = vi.fn();

vi.mock("./workspace-automations", () => ({
  listDueWorkspaceAutomations: (...args: unknown[]) => listDueWorkspaceAutomations(...args),
  repairMissingScheduledWorkspaceAutomationNextRuns: (...args: unknown[]) =>
    repairMissingScheduledWorkspaceAutomationNextRuns(...args),
}));

vi.mock("./workspace-automation-dispatcher", () => ({
  dispatchDueContentfulWorkspaceAutomations: (...args: unknown[]) =>
    dispatchDueContentfulWorkspaceAutomations(...args),
  dispatchWorkspaceAutomationForScheduleAndAdvance: (...args: unknown[]) =>
    dispatchWorkspaceAutomationForScheduleAndAdvance(...args),
}));

vi.mock("@/agents/automations/workspace/agent/plan", async () => {
  const actual = await vi.importActual<typeof import("@/agents/automations/workspace/agent/plan")>(
    "@/agents/automations/workspace/agent/plan",
  );

  return {
    ...actual,
    buildWorkspaceOrchestratorPlan: (...args: unknown[]) => buildWorkspaceOrchestratorPlan(...args),
  };
});

import { runWorkspaceAutomationScheduler } from "./workspace-automation-scheduler";

describe("runWorkspaceAutomationScheduler", () => {
  beforeEach(() => {
    listDueWorkspaceAutomations.mockReset();
    repairMissingScheduledWorkspaceAutomationNextRuns.mockReset();
    repairMissingScheduledWorkspaceAutomationNextRuns.mockResolvedValue(0);
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
      projectId: "project-1",
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
          pushSource: false,
          pullTranslations: false,
          validation: false,
        },
      },
      model: "openai/gpt-5.6-luna",
      configVersion: 1,
      nextRunAt: scheduledRunAt.toISOString(),
      createdAt: scheduledRunAt.toISOString(),
      updatedAt: scheduledRunAt.toISOString(),
    };

    listDueWorkspaceAutomations.mockResolvedValue([automation]);

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
