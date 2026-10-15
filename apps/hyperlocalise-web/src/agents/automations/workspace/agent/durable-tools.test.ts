/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
    20| * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { GithubRepositoryAutomationJobWithRepository } from "@/lib/agents/github/github-repository-automation-jobs";

import { WORKSPACE_AUTOMATION_RUN_CANCELLED } from "./durable-tool-budget";
import type { RepositoryAgentStart } from "./repository-agent";
import type { WorkspaceOrchestratorSession } from "./context";
import type { WorkspaceOrchestratorToolState } from "./run-workspace-orchestrator";

const {
  loadWorkspaceOrchestratorToolSessionMock,
  startGithubRepositoryAgentMock,
  startGitlabRepositoryAgentMock,
  beginAgentRuntimeUsageMock,
  completeAgentRuntimeUsageMock,
  extractAiSdkTokenUsageMock,
  stopGithubSandboxMock,
  stopGitlabSandboxMock,
  getWorkspaceAutomationRunByIdMock,
  getGithubRepositoryAutomationJobByIdMock,
  startRunGithubWorkflowsMock,
  finishRunGithubWorkflowsMock,
  recordRepositoryAgentFailureMock,
  recordRepositoryAgentSuccessMock,
  buildRepositoryAgentToolsMock,
} = vi.hoisted(() => ({
  loadWorkspaceOrchestratorToolSessionMock: vi.fn(),
  startGithubRepositoryAgentMock: vi.fn(),
  startGitlabRepositoryAgentMock: vi.fn(),
  beginAgentRuntimeUsageMock: vi.fn(),
  completeAgentRuntimeUsageMock: vi.fn(),
  extractAiSdkTokenUsageMock: vi.fn(() => ({ inputTokens: 1, outputTokens: 1 })),
  stopGithubSandboxMock: vi.fn(async () => undefined),
  stopGitlabSandboxMock: vi.fn(async () => undefined),
  getWorkspaceAutomationRunByIdMock: vi.fn(),
  getGithubRepositoryAutomationJobByIdMock: vi.fn(),
  startRunGithubWorkflowsMock: vi.fn(),
  finishRunGithubWorkflowsMock: vi.fn(),
  recordRepositoryAgentFailureMock: vi.fn(),
  recordRepositoryAgentSuccessMock: vi.fn(),
  buildRepositoryAgentToolsMock: vi.fn(() => ({})),
}));

vi.mock("./run-workspace-orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./run-workspace-orchestrator")>();
  return {
    ...actual,
    loadWorkspaceOrchestratorToolSession: loadWorkspaceOrchestratorToolSessionMock,
  };
});

vi.mock("./tools/use_github_repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tools/use_github_repository")>();
  return {
    ...actual,
    startGithubRepositoryAgent: startGithubRepositoryAgentMock,
  };
});

vi.mock("./tools/use_gitlab_repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tools/use_gitlab_repository")>();
  return {
    ...actual,
    startGitlabRepositoryAgent: startGitlabRepositoryAgentMock,
  };
});

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  beginAgentRuntimeUsage: beginAgentRuntimeUsageMock,
  completeAgentRuntimeUsage: completeAgentRuntimeUsageMock,
  extractAiSdkTokenUsage: extractAiSdkTokenUsageMock,
}));

vi.mock("@/lib/agents/github/github-repository-automation-sandbox", () => ({
  stopGithubRepositoryAutomationSandbox: stopGithubSandboxMock,
}));

vi.mock("@/lib/gitlab/gitlab-repository-sandbox", () => ({
  stopGitlabRepositorySandbox: stopGitlabSandboxMock,
}));

vi.mock("@/lib/agents/workspace-automations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/workspace-automations")>();
  return {
    ...actual,
    getWorkspaceAutomationRunById: getWorkspaceAutomationRunByIdMock,
  };
});

vi.mock("@/lib/agents/github/github-repository-automation-jobs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/agents/github/github-repository-automation-jobs")>();
  return {
    ...actual,
    getGithubRepositoryAutomationJobById: getGithubRepositoryAutomationJobByIdMock,
  };
});

vi.mock("./tools/run_github_workflows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tools/run_github_workflows")>();
  return {
    ...actual,
    startRunGithubWorkflows: startRunGithubWorkflowsMock,
    finishRunGithubWorkflows: finishRunGithubWorkflowsMock,
  };
});

vi.mock("./repository-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository-agent")>();
  return {
    ...actual,
    recordRepositoryAgentFailure: recordRepositoryAgentFailureMock,
    recordRepositoryAgentSuccess: recordRepositoryAgentSuccessMock,
    buildRepositoryAgentTools: buildRepositoryAgentToolsMock,
  };
});

import {
  executeDurableRepositoryAgentTool,
  failDurableRepositoryAgent,
  finishDurableGithubWorkflows,
  finishDurableRepositoryAgent,
  pollDurableGithubWorkflowsJob,
  startDurableGithubWorkflows,
  startDurableRepositoryAgent,
} from "./durable-tools";

const emptyState: WorkspaceOrchestratorToolState = {
  stepResults: {},
  terminalStatus: null,
  terminalError: null,
};

function session(): WorkspaceOrchestratorSession {
  return {
    organizationId: "org-1",
    automation: { id: "auto-1" } as WorkspaceOrchestratorSession["automation"],
    run: { id: "run-1", status: "running" } as WorkspaceOrchestratorSession["run"],
    plan: { tools: ["use_github_repository"] } as WorkspaceOrchestratorSession["plan"],
    repository: {
      id: "repo-1",
      githubInstallationId: "inst-1",
      githubRepositoryId: "gh-1",
    },
    composedInstructions: "instructions",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

function repositoryStart(overrides: Partial<RepositoryAgentStart> = {}): RepositoryAgentStart {
  return {
    toolName: "use_github_repository",
    sandboxId: "sbx_1",
    model: "anthropic/claude-sonnet-5",
    instructions: "instructions",
    prompt: "prompt",
    gitlabContext: null,
    payload: { repository: "acme/app" },
    emptyDigest: "No repository changes.",
    usage: {
      operationKey: "usage:run-1",
      source: "workspace_automation",
      dimensions: { runId: "run-1" },
    },
    ...overrides,
  };
}

function durableInput() {
  return {
    workspaceAutomationRunId: "run-1",
    organizationId: "org-1",
    planTools: ["use_github_repository" as const],
    state: emptyState,
  };
}

function githubJob(
  status: GithubRepositoryAutomationJobWithRepository["status"],
): GithubRepositoryAutomationJobWithRepository {
  return {
    id: "job-1",
    idempotencyKey: "key-1",
    organizationId: "org-1",
    githubInstallationRepositoryId: "repo-1",
    githubInstallationId: "inst-1",
    githubRepositoryId: "gh-1",
    configVersion: 1,
    triggerMode: "scheduled",
    status,
    skipReason: null,
    triggerBranch: "main",
    commitBefore: null,
    commitAfter: null,
    workflows: {
      pushSource: false,
      pullTranslations: true,
      validation: false,
      validationBlockOnFailure: true,
      statusCheck: { enabled: false, mode: "advisory" },
    },
    resultSummary: null,
    githubDeliveryId: null,
    scheduledRunAt: null,
    workflowRunId: null,
    githubCheckRunId: null,
    lastError: null,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
    completedAt: status === "queued" || status === "running" ? null : "2026-10-10T00:01:00.000Z",
    organizationSlug: "acme",
    repositoryFullName: "acme/app",
    defaultBranch: "main",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadWorkspaceOrchestratorToolSessionMock.mockResolvedValue({ ok: true, session: session() });
  beginAgentRuntimeUsageMock.mockResolvedValue(undefined);
  completeAgentRuntimeUsageMock.mockResolvedValue(undefined);
  getWorkspaceAutomationRunByIdMock.mockResolvedValue({ status: "running" });
  buildRepositoryAgentToolsMock.mockReturnValue({});
  recordRepositoryAgentSuccessMock.mockImplementation(({ text }) => ({ digest: text }));
});

describe("startDurableRepositoryAgent", () => {
  it("stops the sandbox and leaves usage unbilled when billing reservation fails after start", async () => {
    const started = repositoryStart();
    startGithubRepositoryAgentMock.mockResolvedValue(started);
    beginAgentRuntimeUsageMock.mockRejectedValueOnce(new Error("billing_unavailable"));

    const result = await startDurableRepositoryAgent({
      ...durableInput(),
      toolName: "use_github_repository",
    });

    expect(result).toMatchObject({ ok: false, message: "billing_unavailable" });
    expect(stopGithubSandboxMock).toHaveBeenCalledWith("sbx_1");
    expect(stopGitlabSandboxMock).not.toHaveBeenCalled();
    expect(completeAgentRuntimeUsageMock).not.toHaveBeenCalled();
    expect(recordRepositoryAgentFailureMock).toHaveBeenCalledWith({
      session: expect.objectContaining({ run: expect.objectContaining({ id: "run-1" }) }),
      message: "billing_unavailable",
    });
  });

  it("does not stop a sandbox that never started", async () => {
    startGithubRepositoryAgentMock.mockRejectedValueOnce(new Error("clone_failed"));

    const result = await startDurableRepositoryAgent({
      ...durableInput(),
      toolName: "use_github_repository",
    });

    expect(result).toMatchObject({ ok: false, message: "clone_failed" });
    expect(stopGithubSandboxMock).not.toHaveBeenCalled();
    expect(beginAgentRuntimeUsageMock).not.toHaveBeenCalled();
  });

  it("stops a GitLab sandbox with the GitLab stopper after a late start failure", async () => {
    startGitlabRepositoryAgentMock.mockResolvedValue(
      repositoryStart({ toolName: "use_gitlab_repository", sandboxId: "sbx_gl" }),
    );
    beginAgentRuntimeUsageMock.mockRejectedValueOnce(new Error("usage_failed"));

    const result = await startDurableRepositoryAgent({
      ...durableInput(),
      planTools: ["use_gitlab_repository"],
      toolName: "use_gitlab_repository",
    });

    expect(result.ok).toBe(false);
    expect(stopGitlabSandboxMock).toHaveBeenCalledWith("sbx_gl");
    expect(stopGithubSandboxMock).not.toHaveBeenCalled();
  });
});

describe("failDurableRepositoryAgent", () => {
  it("stops the sandbox without completing usage", async () => {
    const result = await failDurableRepositoryAgent({
      ...durableInput(),
      toolName: "use_github_repository",
      sandboxId: "sbx_1",
      message: "agent_crashed",
    });

    expect(result).toMatchObject({ ok: false, message: "agent_crashed" });
    expect(stopGithubSandboxMock).toHaveBeenCalledWith("sbx_1");
    expect(completeAgentRuntimeUsageMock).not.toHaveBeenCalled();
    expect(recordRepositoryAgentFailureMock).toHaveBeenCalledWith({
      session: expect.objectContaining({ organizationId: "org-1" }),
      message: "agent_crashed",
    });
  });

  it("forwards cancelled when the durable step is aborting a cancelled run", async () => {
    const result = await failDurableRepositoryAgent({
      ...durableInput(),
      toolName: "use_github_repository",
      sandboxId: "sbx_1",
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      cancelled: true,
    });

    expect(result).toMatchObject({
      ok: false,
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      cancelled: true,
    });
  });
});

describe("finishDurableRepositoryAgent", () => {
  it("bills usage even if the session can no longer be loaded", async () => {
    loadWorkspaceOrchestratorToolSessionMock.mockResolvedValueOnce({
      ok: false,
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      state: emptyState,
      cancelled: true,
    });

    const result = await finishDurableRepositoryAgent({
      ...durableInput(),
      start: repositoryStart(),
      text: "Digest",
      usage: { totalTokens: 9 },
    });

    expect(result).toMatchObject({
      ok: false,
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      cancelled: true,
    });
    expect(stopGithubSandboxMock).toHaveBeenCalledWith("sbx_1");
    expect(completeAgentRuntimeUsageMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      operationKey: "usage:run-1",
      dimensions: { runId: "run-1" },
      tokenUsage: { inputTokens: 1, outputTokens: 1 },
    });
    expect(recordRepositoryAgentSuccessMock).not.toHaveBeenCalled();
  });
});

describe("executeDurableRepositoryAgentTool", () => {
  it("returns cancelled without executing when the run was cancelled", async () => {
    getWorkspaceAutomationRunByIdMock.mockResolvedValueOnce({ status: "cancelled" });
    const execute = vi.fn();
    buildRepositoryAgentToolsMock.mockReturnValue({
      grep: { execute, inputSchema: z.object({ query: z.string() }) },
    });

    const result = await executeDurableRepositoryAgentTool({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
      start: repositoryStart(),
      toolName: "grep",
      toolCallId: "call-1",
      toolInput: { query: "TODO" },
      todos: [],
    });

    expect(result).toEqual({
      ok: false,
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      todos: [],
      cancelled: true,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects unknown repository tools", async () => {
    const result = await executeDurableRepositoryAgentTool({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
      start: repositoryStart(),
      toolName: "not_a_tool",
      toolCallId: "call-1",
      toolInput: {},
      todos: [],
    });

    expect(result).toMatchObject({ ok: false, message: "unknown_tool: not_a_tool" });
  });
});

describe("pollDurableGithubWorkflowsJob", () => {
  it("classifies cancelled, missing, pending, and terminal jobs", async () => {
    getWorkspaceAutomationRunByIdMock.mockResolvedValueOnce({ status: "cancelled" });
    await expect(
      pollDurableGithubWorkflowsJob({
        workspaceAutomationRunId: "run-1",
        organizationId: "org-1",
        jobId: "job-1",
      }),
    ).resolves.toBe("cancelled");

    getWorkspaceAutomationRunByIdMock.mockResolvedValue({ status: "running" });
    getGithubRepositoryAutomationJobByIdMock.mockResolvedValueOnce(null);
    await expect(
      pollDurableGithubWorkflowsJob({
        workspaceAutomationRunId: "run-1",
        organizationId: "org-1",
        jobId: "job-1",
      }),
    ).resolves.toBe("missing");

    getGithubRepositoryAutomationJobByIdMock.mockResolvedValueOnce(githubJob("running"));
    await expect(
      pollDurableGithubWorkflowsJob({
        workspaceAutomationRunId: "run-1",
        organizationId: "org-1",
        jobId: "job-1",
      }),
    ).resolves.toBe("pending");

    getGithubRepositoryAutomationJobByIdMock.mockResolvedValueOnce(githubJob("succeeded"));
    await expect(
      pollDurableGithubWorkflowsJob({
        workspaceAutomationRunId: "run-1",
        organizationId: "org-1",
        jobId: "job-1",
      }),
    ).resolves.toBe("terminal");
  });
});

describe("finishDurableGithubWorkflows", () => {
  it("fails the session when the job is missing", async () => {
    const loaded = session();
    loadWorkspaceOrchestratorToolSessionMock.mockResolvedValueOnce({ ok: true, session: loaded });
    getGithubRepositoryAutomationJobByIdMock.mockResolvedValueOnce(null);

    const result = await finishDurableGithubWorkflows({
      ...durableInput(),
      planTools: ["run_github_workflows"],
      jobId: "job-1",
      operatorNote: null,
    });

    expect(result).toMatchObject({
      ok: false,
      message: "github_repository_automation_job_not_found",
    });
    expect(loaded.terminalStatus).toBe("failed");
    expect(loaded.terminalError).toBe("github_repository_automation_job_not_found");
    expect(finishRunGithubWorkflowsMock).not.toHaveBeenCalled();
  });

  it("fails the session when the job never reached a terminal status", async () => {
    const loaded = session();
    loadWorkspaceOrchestratorToolSessionMock.mockResolvedValueOnce({ ok: true, session: loaded });
    getGithubRepositoryAutomationJobByIdMock.mockResolvedValueOnce(githubJob("running"));

    const result = await finishDurableGithubWorkflows({
      ...durableInput(),
      planTools: ["run_github_workflows"],
      jobId: "job-1",
      operatorNote: "still running",
    });

    expect(result).toMatchObject({
      ok: false,
      message: "github_repository_automation_job_poll_timeout",
    });
    expect(loaded.terminalStatus).toBe("failed");
    expect(loaded.terminalError).toBe("github_repository_automation_job_poll_timeout");
    expect(finishRunGithubWorkflowsMock).not.toHaveBeenCalled();
  });

  it("records a failed finish when the GitHub adapter throws", async () => {
    getGithubRepositoryAutomationJobByIdMock.mockResolvedValueOnce(githubJob("succeeded"));
    finishRunGithubWorkflowsMock.mockRejectedValueOnce(new Error("dispatch_failed"));

    const result = await finishDurableGithubWorkflows({
      ...durableInput(),
      planTools: ["run_github_workflows"],
      jobId: "job-1",
      operatorNote: null,
    });

    expect(result).toMatchObject({ ok: false, message: "dispatch_failed" });
  });
});

describe("startDurableGithubWorkflows", () => {
  it("returns waiting when the job was claimed but is not finished", async () => {
    startRunGithubWorkflowsMock.mockResolvedValueOnce({
      kind: "waiting",
      jobId: "job-1",
      operatorNote: "queued",
    });

    const result = await startDurableGithubWorkflows({
      ...durableInput(),
      planTools: ["run_github_workflows"],
      toolInput: { summary: "Ship translations" },
    });

    expect(result).toEqual({
      ok: "waiting",
      jobId: "job-1",
      operatorNote: "queued",
      state: emptyState,
    });
    expect(startRunGithubWorkflowsMock).toHaveBeenCalledWith(expect.anything(), {
      summary: "Ship translations",
    });
  });
});
