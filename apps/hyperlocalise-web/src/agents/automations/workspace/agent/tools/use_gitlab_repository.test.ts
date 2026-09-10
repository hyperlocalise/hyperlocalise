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
} from "@/lib/agents/workspace-automation-types";

import type { WorkspaceOrchestratorSession } from "../context";
import { createUseGitlabRepositoryTool } from "./use_gitlab_repository";

const mocks = vi.hoisted(() => ({
  resolveGitLabProjectContext: vi.fn(),
  createGitlabRepositorySandbox: vi.fn(),
  stopGitlabRepositorySandbox: vi.fn(),
  toolLoopGenerate: vi.fn(),
  withAgentRuntimeUsageMetering: vi.fn(),
  composeGitlabRepoInstructions: vi.fn((..._args: unknown[]) => "instructions"),
}));

vi.mock("@/lib/database/client", () => ({
  db: {},
}));

vi.mock("@/lib/gitlab/repository-context", () => ({
  resolveGitLabProjectContext: (...args: unknown[]) => mocks.resolveGitLabProjectContext(...args),
}));

vi.mock("@/lib/gitlab/gitlab-repository-sandbox", () => ({
  createGitlabRepositorySandbox: (...args: unknown[]) =>
    mocks.createGitlabRepositorySandbox(...args),
  stopGitlabRepositorySandbox: (...args: unknown[]) => mocks.stopGitlabRepositorySandbox(...args),
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
  composeGitlabRepoInstructions: (...args: unknown[]) =>
    mocks.composeGitlabRepoInstructions(...args),
}));

vi.mock("@/lib/agents/workspace-automation-types", () => ({
  resolveWorkspaceAutomationModel: vi.fn(() => "model"),
}));

const gitlabContext = {
  resolved: true as const,
  provider: "gitlab" as const,
  projectId: 11,
  repositoryFullName: "acme/platform/web",
  httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
  instanceOrigin: "https://gitlab.com",
  branch: "main",
};

function session(
  overrides: {
    repositoryTarget?: WorkspaceAutomationRecord["repositoryTarget"];
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    triggerSource?: WorkspaceAutomationRunRecord["triggerSource"];
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "GitLab review",
    instructions: "Review localisation impact",
    projectId: null,
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: overrides.repositoryTarget ?? {
      kind: "gitlab",
      gitlabPathWithNamespace: "acme/platform/web",
    },
    toolConfig: overrides.toolConfig ?? {
      gitlab: { enabled: true, workosUserId: "user_workos" },
    },
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
    plan: { tools: ["use_gitlab_repository"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createUseGitlabRepositoryTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveGitLabProjectContext.mockResolvedValue(gitlabContext);
    mocks.createGitlabRepositorySandbox.mockResolvedValue("sbx-gitlab-1");
    mocks.stopGitlabRepositorySandbox.mockResolvedValue(undefined);
    mocks.toolLoopGenerate.mockResolvedValue({ text: "GitLab digest ready" });
    mocks.withAgentRuntimeUsageMetering.mockImplementation(
      async (input: { run: () => Promise<unknown> }) => input.run(),
    );
    mocks.composeGitlabRepoInstructions.mockReturnValue("instructions");
  });

  it("rejects when the automation has no GitLab repository target", async () => {
    await expect(
      createUseGitlabRepositoryTool(session({ repositoryTarget: { kind: "none" } })).execute!(
        {},
        toolOptions,
      ),
    ).rejects.toThrow("gitlab_repository_target_required");

    expect(mocks.resolveGitLabProjectContext).not.toHaveBeenCalled();
    expect(mocks.createGitlabRepositorySandbox).not.toHaveBeenCalled();
  });

  it("rejects when the GitLab project cannot be resolved", async () => {
    mocks.resolveGitLabProjectContext.mockResolvedValue(null);

    await expect(
      createUseGitlabRepositoryTool(session()).execute!({}, toolOptions),
    ).rejects.toThrow("gitlab_repository_not_found");

    expect(mocks.createGitlabRepositorySandbox).not.toHaveBeenCalled();
  });

  it("runs a scheduled lookback review and stops the sandbox", async () => {
    const current = session();

    const payload = await createUseGitlabRepositoryTool(current).execute!({}, toolOptions);

    expect(mocks.resolveGitLabProjectContext).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      workosUserId: "user_workos",
      pathWithNamespace: "acme/platform/web",
      connectionId: null,
    });
    expect(mocks.createGitlabRepositorySandbox).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      workosUserId: "user_workos",
      gitlabContext,
      cloneDepth: 50,
    });
    expect(mocks.composeGitlabRepoInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        userOverride: "Review localisation impact",
        dynamicSections: expect.arrayContaining([
          "Repository: acme/platform/web.",
          "Instance: https://gitlab.com.",
          "Branch: main.",
          "Lookback window: 24 hours.",
          "Sandbox id: sbx-gitlab-1.",
        ]),
      }),
    );
    expect(payload).toEqual({
      digest: "GitLab digest ready",
      repositoryFullName: "acme/platform/web",
      branch: "main",
      lookbackHours: 24,
      instanceOrigin: "https://gitlab.com",
    });
    expect(current.terminalStatus).toBe("succeeded");
    expect(current.stepResults.use_gitlab_repository).toEqual(payload);
    expect(mocks.stopGitlabRepositorySandbox).toHaveBeenCalledWith("sbx-gitlab-1");
  });

  it("clones a self-hosted project with the connection id", async () => {
    const connectionId = "11111111-1111-4111-8111-111111111111";
    const selfHostedContext = {
      ...gitlabContext,
      instanceOrigin: "https://gitlab.acme.example",
      connectionId,
    };
    mocks.resolveGitLabProjectContext.mockResolvedValue(selfHostedContext);

    await createUseGitlabRepositoryTool(
      session({
        repositoryTarget: {
          kind: "gitlab",
          gitlabPathWithNamespace: "acme/platform/web",
          gitlabConnectionId: connectionId,
        },
        toolConfig: {
          gitlab: { enabled: true, connectionId },
        },
      }),
    ).execute!({}, toolOptions);

    expect(mocks.resolveGitLabProjectContext).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      workosUserId: null,
      pathWithNamespace: "acme/platform/web",
      connectionId,
    });
    expect(mocks.createGitlabRepositorySandbox).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      workosUserId: null,
      gitlabContext: selfHostedContext,
      cloneDepth: 50,
    });
  });

  it("marks the session failed and still stops the sandbox when the agent throws", async () => {
    mocks.toolLoopGenerate.mockRejectedValue(new Error("agent_timeout"));
    const current = session();

    await expect(createUseGitlabRepositoryTool(current).execute!({}, toolOptions)).rejects.toThrow(
      "agent_timeout",
    );

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("agent_timeout");
    expect(mocks.stopGitlabRepositorySandbox).toHaveBeenCalledWith("sbx-gitlab-1");
  });
});
