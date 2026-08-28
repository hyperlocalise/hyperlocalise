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
import { createNotifySlackTool } from "./notify_slack";

const mocks = vi.hoisted(() => ({
  runWorkspaceAutomationSlackNotificationTool: vi.fn(),
  buildOrchestratorRunSummaryMessage: vi.fn(),
}));

vi.mock("@/lib/agents/workspace-automation/notification-tools", () => ({
  runWorkspaceAutomationSlackNotificationTool: (...args: unknown[]) =>
    mocks.runWorkspaceAutomationSlackNotificationTool(...args),
}));

vi.mock("../summary-message", () => ({
  buildOrchestratorRunSummaryMessage: (...args: unknown[]) =>
    mocks.buildOrchestratorRunSummaryMessage(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
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
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      slack: { enabled: true, channelId: "C123" },
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
    plan: { tools: ["notify_slack"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createNotifySlackTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildOrchestratorRunSummaryMessage.mockReturnValue("**Localisation digest** SUCCEEDED");
    mocks.runWorkspaceAutomationSlackNotificationTool.mockResolvedValue(ok(undefined));
  });

  it("rejects when Slack notifications are not configured", async () => {
    await expect(
      createNotifySlackTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("slack_not_configured");

    await expect(
      createNotifySlackTool(
        session({
          toolConfig: { slack: { enabled: false, channelId: "C123" } },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("slack_not_configured");

    await expect(
      createNotifySlackTool(
        session({
          toolConfig: { slack: { enabled: true, channelId: "" } },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("slack_not_configured");

    expect(mocks.runWorkspaceAutomationSlackNotificationTool).not.toHaveBeenCalled();
  });

  it("sends a custom message and records a sent step result", async () => {
    const current = session();
    const payload = await createNotifySlackTool(current).execute!(
      { message: "  **Digest** ready  " },
      toolOptions,
    );

    expect(mocks.buildOrchestratorRunSummaryMessage).not.toHaveBeenCalled();
    expect(mocks.runWorkspaceAutomationSlackNotificationTool).toHaveBeenCalledWith({
      organizationId: "org-1",
      channelId: "C123",
      message: "**Digest** ready",
    });
    expect(payload).toEqual({ sent: true, channelId: "C123" });
    expect(current.stepResults.notify_slack).toEqual(payload);
  });

  it("falls back to the orchestrator summary when message is omitted", async () => {
    await createNotifySlackTool(session()).execute!({}, toolOptions);

    expect(mocks.buildOrchestratorRunSummaryMessage).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkspaceAutomationSlackNotificationTool).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "**Localisation digest** SUCCEEDED",
      }),
    );
  });

  it("maps Slack send failures into a non-throwing step result", async () => {
    mocks.runWorkspaceAutomationSlackNotificationTool.mockResolvedValue(
      err({
        code: "slack_send_failed",
        message: "channel_not_found",
      }),
    );

    const current = session();
    const payload = await createNotifySlackTool(current).execute!(
      { message: "Fail soft" },
      toolOptions,
    );

    expect(payload).toEqual({
      sent: false,
      channelId: "C123",
      code: "slack_send_failed",
      message: "channel_not_found",
    });
    expect(current.stepResults.notify_slack).toEqual(payload);
  });
});
