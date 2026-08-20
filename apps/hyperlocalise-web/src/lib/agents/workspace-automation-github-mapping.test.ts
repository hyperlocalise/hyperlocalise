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
import { describe, expect, it } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationToolConfig,
  WorkspaceAutomationTriggerConfig,
} from "./workspace-automations";
import {
  hasWorkspaceAutomationGithubAgentTool,
  hasWorkspaceAutomationGithubTool,
  hasWorkspaceAutomationGithubWorkflow,
  resolveWorkspaceAutomationGithubMode,
  workspaceAutomationMatchesPushBranch,
  workspaceAutomationShouldDispatchOnGithubPullRequest,
  workspaceAutomationShouldDispatchOnGithubPush,
  workspaceAutomationToGithubSettings,
} from "./workspace-automation-github-mapping";

function toolConfig(
  github: NonNullable<WorkspaceAutomationToolConfig["github"]>,
): WorkspaceAutomationToolConfig {
  return { github };
}

function automation(input: {
  projectId?: string | null;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  toolConfig: WorkspaceAutomationToolConfig;
}): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "GitHub automation",
    instructions: "Run GitHub workflows.",
    model: "openai/gpt-5.6-luna",
    projectId: input.projectId ?? "project-1",
    triggerConfig: input.triggerConfig,
    repositoryTarget: {
      kind: "github",
      githubInstallationRepositoryId: "repo-1",
    },
    toolConfig: input.toolConfig,
    configVersion: 3,
    nextRunAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

const syncWorkflow = {
  enabled: true,
  mode: "sync" as const,
  pushSource: true,
  pullTranslations: false,
  validation: true,
};

describe("workspace automation GitHub mapping", () => {
  it("resolves GitHub mode defaults and tool presence", () => {
    expect(resolveWorkspaceAutomationGithubMode({})).toBeNull();
    const { mode: _ignoredMode, ...syncWorkflowWithoutMode } = syncWorkflow;
    expect(
      resolveWorkspaceAutomationGithubMode(
        toolConfig(syncWorkflowWithoutMode as typeof syncWorkflow),
      ),
    ).toBe("sync");
    expect(
      resolveWorkspaceAutomationGithubMode(toolConfig({ ...syncWorkflow, mode: "agent" })),
    ).toBe("agent");

    expect(
      hasWorkspaceAutomationGithubAgentTool(toolConfig({ ...syncWorkflow, mode: "agent" })),
    ).toBe(true);
    expect(
      hasWorkspaceAutomationGithubWorkflow(toolConfig({ ...syncWorkflow, mode: "agent" })),
    ).toBe(false);
    expect(
      hasWorkspaceAutomationGithubWorkflow(
        toolConfig({
          enabled: true,
          mode: "sync",
          pushSource: false,
          pullTranslations: false,
          validation: false,
        }),
      ),
    ).toBe(false);
    expect(hasWorkspaceAutomationGithubWorkflow(toolConfig(syncWorkflow))).toBe(true);
    expect(hasWorkspaceAutomationGithubTool(toolConfig({ ...syncWorkflow, mode: "agent" }))).toBe(
      true,
    );
    expect(hasWorkspaceAutomationGithubTool(toolConfig(syncWorkflow))).toBe(true);
  });

  it("maps sync GitHub workflows onto repository automation settings", () => {
    expect(
      workspaceAutomationToGithubSettings(
        automation({
          triggerConfig: { mode: "github", branches: ["main", "release/*"] },
          toolConfig: toolConfig(syncWorkflow),
        }),
      ),
    ).toEqual({
      workflows: {
        pushSource: { enabled: true, projectId: "project-1" },
        pullTranslations: { enabled: false, projectId: "project-1" },
        validation: { enabled: true, blockOnFailure: true },
      },
      trigger: { mode: "push", branches: ["main", "release/*"] },
      statusCheck: { enabled: false, mode: "blocking" },
    });
  });

  it("maps manual and scheduled triggers for sync workflows", () => {
    expect(
      workspaceAutomationToGithubSettings(
        automation({
          triggerConfig: { mode: "manual" },
          toolConfig: toolConfig(syncWorkflow),
        }),
      )?.trigger,
    ).toEqual({
      mode: "scheduled",
      cadence: "daily",
      hourUtc: 0,
      timezone: "UTC",
    });

    expect(
      workspaceAutomationToGithubSettings(
        automation({
          triggerConfig: {
            mode: "scheduled",
            schedule: {
              cadence: "weekly",
              hourUtc: 9,
              dayOfWeek: 1,
              timezone: "Australia/Sydney",
            },
          },
          toolConfig: toolConfig(syncWorkflow),
        }),
      )?.trigger,
    ).toEqual({
      mode: "scheduled",
      cadence: "weekly",
      hourUtc: 9,
      dayOfWeek: 1,
      timezone: "Australia/Sydney",
    });
  });

  it("returns null when sync mapping prerequisites are missing", () => {
    expect(
      workspaceAutomationToGithubSettings(
        automation({
          projectId: "   ",
          triggerConfig: { mode: "github", branches: ["main"] },
          toolConfig: toolConfig(syncWorkflow),
        }),
      ),
    ).toBeNull();

    expect(
      workspaceAutomationToGithubSettings(
        automation({
          triggerConfig: { mode: "github", branches: ["main"] },
          toolConfig: toolConfig({ ...syncWorkflow, mode: "agent" }),
        }),
      ),
    ).toBeNull();

    expect(
      workspaceAutomationToGithubSettings(
        automation({
          triggerConfig: { mode: "github", branches: [] },
          toolConfig: toolConfig(syncWorkflow),
        }),
      ),
    ).toBeNull();

    expect(
      workspaceAutomationToGithubSettings(
        automation({
          triggerConfig: { mode: "contentful" },
          toolConfig: toolConfig(syncWorkflow),
        }),
      ),
    ).toBeNull();
  });

  it("matches push branches only for GitHub-triggered automations", () => {
    const githubAutomation = automation({
      triggerConfig: { mode: "github", branches: ["main", "release/*"] },
      toolConfig: toolConfig(syncWorkflow),
    });

    expect(workspaceAutomationMatchesPushBranch(githubAutomation, "main")).toBe(true);
    expect(workspaceAutomationMatchesPushBranch(githubAutomation, "release/1.2")).toBe(true);
    expect(workspaceAutomationMatchesPushBranch(githubAutomation, "feature/x")).toBe(false);

    expect(
      workspaceAutomationMatchesPushBranch(
        automation({
          triggerConfig: { mode: "manual" },
          toolConfig: toolConfig(syncWorkflow),
        }),
        "main",
      ),
    ).toBe(false);
  });

  it("dispatches GitHub agent and comment automations on matching pushes", () => {
    const agentAutomation = automation({
      triggerConfig: { mode: "github", branches: ["main"] },
      toolConfig: {
        github: {
          enabled: true,
          mode: "agent",
          pushSource: false,
          pullTranslations: false,
          validation: false,
        },
        githubComment: { enabled: true },
      },
    });

    expect(workspaceAutomationShouldDispatchOnGithubPush(agentAutomation, "main")).toBe(true);
    expect(workspaceAutomationShouldDispatchOnGithubPush(agentAutomation, "feature/x")).toBe(false);
    expect(workspaceAutomationShouldDispatchOnGithubPullRequest(agentAutomation, "main")).toBe(
      false,
    );
    expect(
      workspaceAutomationShouldDispatchOnGithubPush(
        automation({
          triggerConfig: { mode: "manual" },
          toolConfig: {
            github: {
              enabled: true,
              mode: "agent",
              pushSource: false,
              pullTranslations: false,
              validation: false,
            },
          },
        }),
        "main",
      ),
    ).toBe(false);
  });

  it("dispatches GitHub agent automations on matching pull request base branches", () => {
    const agentAutomation = automation({
      triggerConfig: { mode: "github", branches: ["main"], events: ["pull_request"] },
      toolConfig: {
        github: {
          enabled: true,
          mode: "agent",
          pushSource: false,
          pullTranslations: false,
          validation: false,
        },
        githubComment: { enabled: true },
      },
    });

    expect(workspaceAutomationShouldDispatchOnGithubPullRequest(agentAutomation, "main")).toBe(
      true,
    );
    expect(workspaceAutomationShouldDispatchOnGithubPush(agentAutomation, "main")).toBe(false);
    expect(workspaceAutomationShouldDispatchOnGithubPullRequest(agentAutomation, "feature/x")).toBe(
      false,
    );
    expect(
      workspaceAutomationShouldDispatchOnGithubPullRequest(
        automation({
          triggerConfig: { mode: "github", branches: ["main"], events: ["push"] },
          toolConfig: agentAutomation.toolConfig,
        }),
        "main",
      ),
    ).toBe(false);
    expect(
      workspaceAutomationShouldDispatchOnGithubPullRequest(
        automation({
          triggerConfig: { mode: "github", branches: ["main"], events: ["push", "pull_request"] },
          toolConfig: agentAutomation.toolConfig,
        }),
        "main",
      ),
    ).toBe(true);
  });
});
