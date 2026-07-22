/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  dispatchGithubRepositoryAutomationForPushMock,
  dispatchWorkspaceAutomationsForGithubPushMock,
  loggerErrorMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  dispatchGithubRepositoryAutomationForPushMock: vi.fn(),
  dispatchWorkspaceAutomationsForGithubPushMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    error: loggerErrorMock,
    info: loggerInfoMock,
  })),
}));

vi.mock("./github-repository-automation-dispatcher", () => ({
  dispatchGithubRepositoryAutomationForPush: dispatchGithubRepositoryAutomationForPushMock,
}));

vi.mock("../workspace-automation-dispatcher", () => ({
  dispatchWorkspaceAutomationsForGithubPush: dispatchWorkspaceAutomationsForGithubPushMock,
}));

import { handleGithubPushWebhook } from "./github-push-webhook";

describe("handleGithubPushWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchGithubRepositoryAutomationForPushMock.mockResolvedValue({
      job: { id: "job_123" },
      outcome: "enqueued",
    });
    dispatchWorkspaceAutomationsForGithubPushMock.mockResolvedValue([]);
  });

  it("does not fail the webhook when workspace automation dispatch fails", async () => {
    dispatchWorkspaceAutomationsForGithubPushMock.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(
      handleGithubPushWebhook({
        deliveryId: "delivery-1",
        organizationId: "org_123",
        githubInstallationId: "installation-123",
        githubInstallationRepositoryId: "installation-repo-123",
        githubRepositoryId: "repo-123",
        payload: {
          after: "after-sha",
          before: "before-sha",
          ref: "refs/heads/main",
        },
      }),
    ).resolves.toEqual({
      automation: {
        jobId: "job_123",
        outcome: "enqueued",
      },
      ignored: false,
    });

    expect(dispatchGithubRepositoryAutomationForPushMock).toHaveBeenCalledOnce();
    expect(dispatchWorkspaceAutomationsForGithubPushMock).toHaveBeenCalledOnce();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      {
        deliveryId: "delivery-1",
        error: "database unavailable",
        repositoryId: "repo-123",
      },
      "workspace automations github push dispatch failed",
    );
  });
});
