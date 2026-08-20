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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";
import { createUseGithubRepositoryTool } from "./use_github_repository";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  createGithubRepositoryAutomationSandbox: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.selectLimit,
        })),
      })),
    })),
  },
  schema: {
    githubInstallationRepositories: {
      id: "id",
      organizationId: "organizationId",
      fullName: "fullName",
      defaultBranch: "defaultBranch",
      githubInstallationId: "githubInstallationId",
    },
  },
}));

vi.mock("@/lib/agents/github/github-repository-automation-sandbox", () => ({
  createGithubRepositoryAutomationSandbox: (...args: unknown[]) =>
    mocks.createGithubRepositoryAutomationSandbox(...args),
  stopGithubRepositoryAutomationSandbox: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    ToolLoopAgent: class {
      generate = vi.fn();
    },
    isStepCount: vi.fn(() => () => false),
  };
});

vi.mock("@/lib/agent-runtime/tools/registry", () => ({
  buildTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/agent-runtime/tools/manifest", () => ({
  filterToolSetByNames: vi.fn((tools: unknown) => tools),
  repositoryWorkflowToolNames: [],
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  extractGenerateResultTokenUsage: vi.fn(),
  withAgentRuntimeUsageMetering: vi.fn(),
}));

vi.mock("@/lib/tools/types", () => ({
  ensureAgentSession: vi.fn(),
}));

vi.mock("@/agents/automations/workspace/agent/workspace-template-manifest", () => ({
  composeGithubRepoInstructions: vi.fn(() => "instructions"),
}));

vi.mock("@/lib/agents/workspace-automation-types", () => ({
  resolveWorkspaceAutomationModel: vi.fn(() => "model"),
}));

function session(
  overrides: {
    repository?: WorkspaceOrchestratorSession["repository"];
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Repo review",
    instructions: "Review localisation impact",
    projectId: null,
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "github", githubInstallationRepositoryId: "repo-row-1" },
    toolConfig: {},
    model: "openai/gpt-5.6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "scheduled",
    status: "running",
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRunRecord;

  return {
    organizationId: automation.organizationId,
    automation,
    run,
    plan: { tools: ["use_github_repository"] },
    repository:
      overrides.repository === undefined
        ? {
            id: "repo-row-1",
            githubInstallationId: "42",
            githubRepositoryId: "gh-repo-1",
          }
        : overrides.repository,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createUseGithubRepositoryTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when the session has no repository target", async () => {
    await expect(
      createUseGithubRepositoryTool(session({ repository: null })).execute!({}, toolOptions),
    ).rejects.toThrow("github_repository_target_required");

    expect(mocks.selectLimit).not.toHaveBeenCalled();
    expect(mocks.createGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
  });

  it("rejects when the repository is missing for the organization", async () => {
    mocks.selectLimit.mockResolvedValue([]);

    await expect(
      createUseGithubRepositoryTool(session()).execute!({}, toolOptions),
    ).rejects.toThrow("github_repository_not_found");

    expect(mocks.createGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
  });
});
