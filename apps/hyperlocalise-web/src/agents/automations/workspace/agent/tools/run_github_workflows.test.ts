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

import type { GithubRepositoryAutomationJobRecord } from "@/lib/agents/github/github-repository-automation-jobs";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";
import { createRunGithubWorkflowsTool } from "./run_github_workflows";

const mocks = vi.hoisted(() => ({
  claimGithubRepositoryAutomationJob: vi.fn(),
  getGithubRepositoryAutomationJobById: vi.fn(),
  enqueueGithubRepositoryAutomationJob: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/agents/github/github-repository-automation-jobs", () => ({
  claimGithubRepositoryAutomationJob: (...args: unknown[]) =>
    mocks.claimGithubRepositoryAutomationJob(...args),
  getGithubRepositoryAutomationJobById: (...args: unknown[]) =>
    mocks.getGithubRepositoryAutomationJobById(...args),
}));

vi.mock("@/lib/agents/github/github-repository-automation-worker", () => ({
  enqueueGithubRepositoryAutomationJob: (...args: unknown[]) =>
    mocks.enqueueGithubRepositoryAutomationJob(...args),
}));

vi.mock("@/lib/agents/workspace-automations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/workspace-automations")>();
  return {
    ...actual,
    updateWorkspaceAutomationRun: (...args: unknown[]) =>
      mocks.updateWorkspaceAutomationRun(...args),
  };
});

vi.mock("@/lib/agent-runtime/subagents/constants", () => ({
  WORKSPACE_GITHUB_JOB_POLL_INTERVAL_MS: 1,
  WORKSPACE_GITHUB_JOB_POLL_MAX_MS: 50,
}));

function job(
  overrides: Partial<GithubRepositoryAutomationJobRecord> = {},
): GithubRepositoryAutomationJobRecord {
  return {
    id: "job-1",
    idempotencyKey: "idem-1",
    organizationId: "org-1",
    githubInstallationRepositoryId: "repo-row-1",
    githubInstallationId: "42",
    githubRepositoryId: "gh-repo-1",
    configVersion: 1,
    triggerMode: "scheduled",
    status: "queued",
    skipReason: null,
    triggerBranch: null,
    commitBefore: null,
    commitAfter: null,
    workflows: {
      pushSource: true,
      pullTranslations: false,
      validation: false,
      validationBlockOnFailure: true,
      statusCheck: { enabled: false, mode: "blocking" },
    },
    resultSummary: null,
    githubDeliveryId: null,
    scheduledRunAt: null,
    workflowRunId: null,
    githubCheckRunId: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

function session(
  overrides: {
    repository?: WorkspaceOrchestratorSession["repository"];
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    projectId?: string | null;
    triggerSource?: WorkspaceAutomationRunRecord["triggerSource"];
    inputSnapshot?: WorkspaceAutomationRunRecord["inputSnapshot"];
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "GitHub sync",
    instructions: "",
    projectId: overrides.projectId === undefined ? "project-1" : overrides.projectId,
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "github", githubInstallationRepositoryId: "repo-row-1" },
    toolConfig: overrides.toolConfig ?? {
      github: {
        enabled: true,
        mode: "sync",
        pushSource: true,
        pullTranslations: false,
        validation: false,
      },
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
    plan: { tools: ["run_github_workflows"] },
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

describe("createRunGithubWorkflowsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
    mocks.enqueueGithubRepositoryAutomationJob.mockResolvedValue(undefined);
  });

  it("rejects when the session has no repository target", async () => {
    await expect(
      createRunGithubWorkflowsTool(session({ repository: null })).execute!({}, toolOptions),
    ).rejects.toThrow("github_repository_target_required");

    expect(mocks.claimGithubRepositoryAutomationJob).not.toHaveBeenCalled();
  });

  it("rejects when GitHub workflows are not configured", async () => {
    await expect(
      createRunGithubWorkflowsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("github_workflows_not_configured");

    await expect(
      createRunGithubWorkflowsTool(session({ projectId: null })).execute!({}, toolOptions),
    ).rejects.toThrow("github_workflows_not_configured");

    expect(mocks.claimGithubRepositoryAutomationJob).not.toHaveBeenCalled();
  });

  it("records a skipped claim without enqueueing work", async () => {
    const skipped = job({
      status: "skipped",
      skipReason: "no_enabled_workflows",
      completedAt: new Date().toISOString(),
    });
    mocks.claimGithubRepositoryAutomationJob.mockResolvedValue({
      inserted: true,
      job: skipped,
    });

    const current = session();
    const payload = await createRunGithubWorkflowsTool(current).execute!(
      { summary: "  nightly sync  " },
      toolOptions,
    );

    expect(mocks.enqueueGithubRepositoryAutomationJob).not.toHaveBeenCalled();
    expect(mocks.getGithubRepositoryAutomationJobById).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        githubRepositoryAutomationJobId: "job-1",
        status: "skipped",
        outputSummary: {
          operatorNote: "nightly sync",
          skipReason: "no_enabled_workflows",
        },
      }),
    );
    expect(payload).toEqual({
      jobId: "job-1",
      status: "skipped",
      skipReason: "no_enabled_workflows",
    });
    expect(current.terminalStatus).toBe("skipped");
    expect(current.stepResults.run_github_workflows).toEqual(payload);
  });

  it("enqueues a queued job, waits for success, and maps terminal status", async () => {
    const queued = job({ status: "queued" });
    const succeeded = job({
      status: "succeeded",
      resultSummary: { pushedFiles: 3 },
      completedAt: new Date().toISOString(),
    });
    mocks.claimGithubRepositoryAutomationJob.mockResolvedValue({
      inserted: true,
      job: queued,
    });
    mocks.getGithubRepositoryAutomationJobById.mockResolvedValue(succeeded);

    const current = session();
    const payload = await createRunGithubWorkflowsTool(current).execute!({}, toolOptions);

    expect(mocks.enqueueGithubRepositoryAutomationJob).toHaveBeenCalledWith({ jobId: "job-1" });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: "run-1",
        githubRepositoryAutomationJobId: "job-1",
        status: "running",
      }),
    );
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        runId: "run-1",
        status: "succeeded",
        outputSummary: {
          pushedFiles: 3,
          githubRepositoryAutomationJobId: "job-1",
        },
        error: null,
      }),
    );
    expect(payload).toEqual({
      jobId: "job-1",
      status: "succeeded",
      skipReason: null,
      resultSummary: { pushedFiles: 3 },
    });
    expect(current.terminalStatus).toBe("succeeded");
    expect(current.terminalError).toBeNull();
    expect(current.stepResults.run_github_workflows).toEqual(payload);
  });

  it("maps failed terminal jobs onto session error state", async () => {
    mocks.claimGithubRepositoryAutomationJob.mockResolvedValue({
      inserted: true,
      job: job({ status: "queued" }),
    });
    mocks.getGithubRepositoryAutomationJobById.mockResolvedValue(
      job({
        status: "failed",
        lastError: "push_failed",
        completedAt: new Date().toISOString(),
      }),
    );

    const current = session();
    const payload = await createRunGithubWorkflowsTool(current).execute!({}, toolOptions);

    expect(payload).toEqual({
      jobId: "job-1",
      status: "failed",
      skipReason: null,
      resultSummary: null,
    });
    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("push_failed");
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        error: { message: "push_failed" },
      }),
    );
  });
});
