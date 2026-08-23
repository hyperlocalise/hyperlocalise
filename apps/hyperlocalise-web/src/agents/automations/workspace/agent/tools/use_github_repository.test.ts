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
  stopGithubRepositoryAutomationSandbox: vi.fn(),
  toolLoopGenerate: vi.fn(),
  withAgentRuntimeUsageMetering: vi.fn(),
  composeGithubRepoInstructions: vi.fn(() => "instructions"),
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
  stopGithubRepositoryAutomationSandbox: (...args: unknown[]) =>
    mocks.stopGithubRepositoryAutomationSandbox(...args),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    ToolLoopAgent: class {
      generate = mocks.toolLoopGenerate;
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
  withAgentRuntimeUsageMetering: (...args: unknown[]) =>
    mocks.withAgentRuntimeUsageMetering(...args),
}));

vi.mock("@/lib/tools/types", () => ({
  ensureAgentSession: vi.fn(),
}));

vi.mock("@/agents/automations/workspace/agent/workspace-template-manifest", () => ({
  composeGithubRepoInstructions: (...args: unknown[]) =>
    mocks.composeGithubRepoInstructions(...args),
}));

vi.mock("@/lib/agents/workspace-automation-types", () => ({
  resolveWorkspaceAutomationModel: vi.fn(() => "model"),
}));

function session(
  overrides: {
    repository?: WorkspaceOrchestratorSession["repository"];
    triggerSource?: WorkspaceAutomationRunRecord["triggerSource"];
    inputSnapshot?: WorkspaceAutomationRunRecord["inputSnapshot"];
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
    triggerSource: overrides.triggerSource ?? "scheduled",
    status: "running",
    inputSnapshot: overrides.inputSnapshot ?? {},
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

const repositoryRow = {
  fullName: "acme/app",
  defaultBranch: "main",
  githubInstallationId: "42",
};

describe("createUseGithubRepositoryTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([repositoryRow]);
    mocks.createGithubRepositoryAutomationSandbox.mockResolvedValue("sbx-1");
    mocks.stopGithubRepositoryAutomationSandbox.mockResolvedValue(undefined);
    mocks.toolLoopGenerate.mockResolvedValue({ text: "Digest ready" });
    mocks.withAgentRuntimeUsageMetering.mockImplementation(
      async (input: { run: () => Promise<unknown> }) => input.run(),
    );
    mocks.composeGithubRepoInstructions.mockReturnValue("instructions");
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

  it("runs a scheduled lookback review and stops the sandbox", async () => {
    const current = session();

    const payload = await createUseGithubRepositoryTool(current).execute!({}, toolOptions);

    expect(mocks.createGithubRepositoryAutomationSandbox).toHaveBeenCalledWith({
      installationId: "42",
      repositoryFullName: "acme/app",
      revision: "main",
      cloneDepth: 50,
    });
    expect(mocks.composeGithubRepoInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        userOverride: "Review localisation impact",
        dynamicSections: expect.arrayContaining([
          "Repository: acme/app.",
          "Branch: main.",
          "Lookback window: 24 hours.",
          "Sandbox id: sbx-1.",
        ]),
      }),
    );
    expect(payload).toEqual({
      digest: "Digest ready",
      repositoryFullName: "acme/app",
      branch: "main",
      lookbackHours: 24,
    });
    expect(current.terminalStatus).toBe("succeeded");
    expect(current.stepResults.use_github_repository).toEqual(payload);
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("uses the GitHub push commit range for sandbox revision and payload", async () => {
    const current = session({
      triggerSource: "github",
      inputSnapshot: {
        pushBranch: "release",
        commitBefore: "aaa111",
        commitAfter: "bbb222",
      },
    });

    const payload = await createUseGithubRepositoryTool(current).execute!({}, toolOptions);

    expect(mocks.createGithubRepositoryAutomationSandbox).toHaveBeenCalledWith({
      installationId: "42",
      repositoryFullName: "acme/app",
      revision: "bbb222",
      cloneDepth: 50,
    });
    expect(mocks.composeGithubRepoInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicSections: expect.arrayContaining([
          "Branch: release.",
          "Inspect this push: aaa111..bbb222 on release.",
        ]),
      }),
    );
    expect(payload).toEqual({
      digest: "Digest ready",
      repositoryFullName: "acme/app",
      branch: "release",
      lookbackHours: null,
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });
    expect(current.terminalStatus).toBe("succeeded");
  });

  it("marks the session failed and still stops the sandbox when the agent throws", async () => {
    mocks.toolLoopGenerate.mockRejectedValue(new Error("agent_timeout"));
    const current = session();

    await expect(createUseGithubRepositoryTool(current).execute!({}, toolOptions)).rejects.toThrow(
      "agent_timeout",
    );

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("agent_timeout");
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });
});
