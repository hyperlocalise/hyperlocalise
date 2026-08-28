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
import { createNotifyEmailTool } from "./notify_email";

const mocks = vi.hoisted(() => ({
  runWorkspaceAutomationEmailNotificationTool: vi.fn(),
  buildOrchestratorRunSummaryMessage: vi.fn(),
}));

vi.mock("@/lib/agents/workspace-automation/notification-tools", () => ({
  runWorkspaceAutomationEmailNotificationTool: (...args: unknown[]) =>
    mocks.runWorkspaceAutomationEmailNotificationTool(...args),
}));

vi.mock("../summary-message", () => ({
  buildOrchestratorRunSummaryMessage: (...args: unknown[]) =>
    mocks.buildOrchestratorRunSummaryMessage(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    terminalStatus?: WorkspaceOrchestratorSession["terminalStatus"];
    runStatus?: WorkspaceAutomationRunRecord["status"];
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
      email: { enabled: true, recipients: ["ops@example.com", "l10n@example.com"] },
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
    status: overrides.runStatus ?? "running",
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
    plan: { tools: ["notify_email"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: overrides.terminalStatus ?? null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createNotifyEmailTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildOrchestratorRunSummaryMessage.mockReturnValue("**Localisation digest** SUCCEEDED");
    mocks.runWorkspaceAutomationEmailNotificationTool.mockResolvedValue(ok(undefined));
  });

  it("rejects when email notifications are not configured", async () => {
    await expect(
      createNotifyEmailTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("email_not_configured");

    await expect(
      createNotifyEmailTool(
        session({
          toolConfig: { email: { enabled: false, recipients: ["ops@example.com"] } },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("email_not_configured");

    await expect(
      createNotifyEmailTool(
        session({
          toolConfig: { email: { enabled: true, recipients: [] } },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("email_not_configured");

    expect(mocks.runWorkspaceAutomationEmailNotificationTool).not.toHaveBeenCalled();
  });

  it("sends a custom message and subject and records a sent step result", async () => {
    const current = session();
    const payload = await createNotifyEmailTool(current).execute!(
      { message: "  Digest ready  ", subject: "  Custom subject  " },
      toolOptions,
    );

    expect(mocks.buildOrchestratorRunSummaryMessage).not.toHaveBeenCalled();
    expect(mocks.runWorkspaceAutomationEmailNotificationTool).toHaveBeenCalledWith({
      recipients: ["ops@example.com", "l10n@example.com"],
      subject: "Custom subject",
      message: "Digest ready",
    });
    expect(payload).toEqual({ sent: true, recipientCount: 2 });
    expect(current.stepResults.notify_email).toEqual(payload);
  });

  it("falls back to the orchestrator summary and default subject", async () => {
    const current = session({ terminalStatus: "succeeded", runStatus: "succeeded" });
    await createNotifyEmailTool(current).execute!({}, toolOptions);

    expect(mocks.buildOrchestratorRunSummaryMessage).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkspaceAutomationEmailNotificationTool).toHaveBeenCalledWith({
      recipients: ["ops@example.com", "l10n@example.com"],
      subject: "Automation run succeeded: Localisation digest",
      message: "**Localisation digest** SUCCEEDED",
    });
  });

  it("uses the run status in the default subject when terminalStatus is unset", async () => {
    await createNotifyEmailTool(session({ runStatus: "failed" })).execute!(
      { message: "Run failed" },
      toolOptions,
    );

    expect(mocks.runWorkspaceAutomationEmailNotificationTool).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Automation run failed: Localisation digest",
        message: "Run failed",
      }),
    );
  });

  it("maps email send failures into a non-throwing step result", async () => {
    mocks.runWorkspaceAutomationEmailNotificationTool.mockResolvedValue(
      err({
        code: "email_send_failed",
        message: "Resend unavailable",
      }),
    );

    const current = session();
    const payload = await createNotifyEmailTool(current).execute!(
      { message: "Fail soft" },
      toolOptions,
    );

    expect(payload).toEqual({
      sent: false,
      recipientCount: 2,
      code: "email_send_failed",
      message: "Resend unavailable",
    });
    expect(current.stepResults.notify_email).toEqual(payload);
  });
});
