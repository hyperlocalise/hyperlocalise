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

import { err, ok } from "@/lib/primitives/result/results";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";

import type { WorkspaceOrchestratorSession } from "../context";
import { createNotifyGithubCommentTool } from "./notify_github_comment";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  upsertWorkspaceAutomationPullRequestComment: vi.fn(),
  buildOrchestratorRunSummaryMessage: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
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
      githubInstallationId: "githubInstallationId",
    },
  },
}));

vi.mock("@/lib/agents/github/upsert-workspace-automation-pull-request-comment", () => ({
  upsertWorkspaceAutomationPullRequestComment: (...args: unknown[]) =>
    mocks.upsertWorkspaceAutomationPullRequestComment(...args),
}));

vi.mock("../summary-message", () => ({
  buildOrchestratorRunSummaryMessage: (...args: unknown[]) =>
    mocks.buildOrchestratorRunSummaryMessage(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    repository?: WorkspaceOrchestratorSession["repository"];
    inputSnapshot?: Record<string, unknown>;
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Localisation digest",
    instructions: "",
    projectId: null,
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "github", githubInstallationRepositoryId: "repo-row-1" },
    toolConfig: overrides.toolConfig ?? {
      githubComment: { enabled: true },
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
    triggerSource: "scheduled",
    status: "running",
    inputSnapshot: overrides.inputSnapshot ?? {
      commitAfter: "abc123def456",
    },
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
    plan: { tools: ["notify_github_comment"] },
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

describe("createNotifyGithubCommentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([
      {
        fullName: "acme/app",
        githubInstallationId: 42,
      },
    ]);
    mocks.buildOrchestratorRunSummaryMessage.mockReturnValue("**Localisation digest** SUCCEEDED");
    mocks.upsertWorkspaceAutomationPullRequestComment.mockResolvedValue(
      ok({
        status: "created",
        pullRequestNumber: 17,
        commentId: 9001,
        url: "https://github.com/acme/app/pull/17#issuecomment-9001",
      }),
    );
  });

  it("rejects when GitHub comment notifications are not configured", async () => {
    await expect(
      createNotifyGithubCommentTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("github_comment_not_configured");

    await expect(
      createNotifyGithubCommentTool(
        session({
          toolConfig: { githubComment: { enabled: false } },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("github_comment_not_configured");

    expect(mocks.upsertWorkspaceAutomationPullRequestComment).not.toHaveBeenCalled();
  });

  it("rejects when the session has no repository target", async () => {
    await expect(
      createNotifyGithubCommentTool(session({ repository: null })).execute!({}, toolOptions),
    ).rejects.toThrow("github_repository_target_required");

    expect(mocks.selectLimit).not.toHaveBeenCalled();
    expect(mocks.upsertWorkspaceAutomationPullRequestComment).not.toHaveBeenCalled();
  });

  it("rejects when the repository is missing for the organization", async () => {
    mocks.selectLimit.mockResolvedValue([]);

    await expect(
      createNotifyGithubCommentTool(session()).execute!({}, toolOptions),
    ).rejects.toThrow("github_repository_not_found");

    expect(mocks.upsertWorkspaceAutomationPullRequestComment).not.toHaveBeenCalled();
  });

  it("posts a custom message and records a created step result", async () => {
    const current = session();
    const payload = await createNotifyGithubCommentTool(current).execute!(
      { message: "  **Digest** ready  " },
      toolOptions,
    );

    expect(mocks.buildOrchestratorRunSummaryMessage).not.toHaveBeenCalled();
    expect(mocks.upsertWorkspaceAutomationPullRequestComment).toHaveBeenCalledWith({
      installationId: 42,
      repositoryFullName: "acme/app",
      automationId: "automation-1",
      commitSha: "abc123def456",
      message: "**Digest** ready",
    });
    expect(payload).toEqual({
      posted: true,
      skipped: false,
      action: "created",
      pullRequestNumber: 17,
      commentId: 9001,
      url: "https://github.com/acme/app/pull/17#issuecomment-9001",
    });
    expect(current.stepResults.notify_github_comment).toEqual(payload);
  });

  it("falls back to the orchestrator summary when message is omitted", async () => {
    await createNotifyGithubCommentTool(session()).execute!({}, toolOptions);

    expect(mocks.buildOrchestratorRunSummaryMessage).toHaveBeenCalledTimes(1);
    expect(mocks.upsertWorkspaceAutomationPullRequestComment).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "**Localisation digest** SUCCEEDED",
      }),
    );
  });

  it("passes commitAfter through and clears blank snapshot values", async () => {
    await createNotifyGithubCommentTool(
      session({
        inputSnapshot: { commitAfter: "0000000000000000000000000000000000000000" },
      }),
    ).execute!({ message: "No PR expected" }, toolOptions);

    // Null OID handling lives in upsert; the tool must still forward the snapshot value.
    expect(mocks.upsertWorkspaceAutomationPullRequestComment).toHaveBeenCalledWith(
      expect.objectContaining({
        commitSha: "0000000000000000000000000000000000000000",
        message: "No PR expected",
      }),
    );

    await createNotifyGithubCommentTool(
      session({
        inputSnapshot: { commitAfter: "   " },
      }),
    ).execute!({ message: "Blank commit" }, toolOptions);

    expect(mocks.upsertWorkspaceAutomationPullRequestComment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commitSha: "",
        message: "Blank commit",
      }),
    );

    await createNotifyGithubCommentTool(
      session({
        inputSnapshot: {},
      }),
    ).execute!({ message: "Missing commit" }, toolOptions);

    expect(mocks.upsertWorkspaceAutomationPullRequestComment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commitSha: "",
        message: "Missing commit",
      }),
    );
  });

  it("maps skipped upsert results without throwing", async () => {
    mocks.upsertWorkspaceAutomationPullRequestComment.mockResolvedValue(
      ok({ status: "skipped", code: "github_pr_not_found" }),
    );

    const current = session();
    const payload = await createNotifyGithubCommentTool(current).execute!(
      { message: "Skip me" },
      toolOptions,
    );

    expect(payload).toEqual({
      posted: false,
      skipped: true,
      code: "github_pr_not_found",
    });
    expect(current.stepResults.notify_github_comment).toEqual(payload);
  });

  it("maps upsert send failures into a non-throwing step result", async () => {
    mocks.upsertWorkspaceAutomationPullRequestComment.mockResolvedValue(
      err({
        code: "github_comment_send_failed",
        message: "GitHub API unavailable",
      }),
    );

    const current = session();
    const payload = await createNotifyGithubCommentTool(current).execute!(
      { message: "Fail soft" },
      toolOptions,
    );

    expect(payload).toEqual({
      posted: false,
      skipped: false,
      code: "github_comment_send_failed",
      message: "GitHub API unavailable",
    });
    expect(current.stepResults.notify_github_comment).toEqual(payload);
  });

  it("maps updated upsert results", async () => {
    mocks.upsertWorkspaceAutomationPullRequestComment.mockResolvedValue(
      ok({
        status: "updated",
        pullRequestNumber: 17,
        commentId: 9001,
        url: "https://github.com/acme/app/pull/17#issuecomment-9001",
      }),
    );

    const payload = await createNotifyGithubCommentTool(session()).execute!(
      { message: "Sticky update" },
      toolOptions,
    );

    expect(payload).toMatchObject({
      posted: true,
      skipped: false,
      action: "updated",
      commentId: 9001,
    });
  });
});
