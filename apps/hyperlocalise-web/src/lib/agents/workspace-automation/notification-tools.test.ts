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

import { isErr, isOk } from "@/lib/primitives/result/results";

const envState = vi.hoisted(() => ({
  SLACK_CLIENT_ID: "slack-client-id" as string | undefined,
  SLACK_CLIENT_SECRET: "slack-client-secret" as string | undefined,
  SLACK_SIGNING_SECRET: "slack-signing-secret" as string | undefined,
}));

const mocks = vi.hoisted(() => ({
  postSlackChannelMessage: vi.fn(),
  loadEmailPipesApiKey: vi.fn(),
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: envState,
}));

vi.mock("@/lib/agents/slack/post-channel-message", () => ({
  postSlackChannelMessage: (...args: unknown[]) => mocks.postSlackChannelMessage(...args),
}));

vi.mock("@/lib/email/pipes", () => ({
  loadEmailPipesApiKey: (...args: unknown[]) => mocks.loadEmailPipesApiKey(...args),
}));

vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mocks.sendTransactionalEmail(...args),
}));

import {
  runWorkspaceAutomationEmailNotificationTool,
  runWorkspaceAutomationSlackNotificationTool,
} from "./notification-tools";

describe("runWorkspaceAutomationSlackNotificationTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.SLACK_CLIENT_ID = "slack-client-id";
    envState.SLACK_CLIENT_SECRET = "slack-client-secret";
    envState.SLACK_SIGNING_SECRET = "slack-signing-secret";
    mocks.postSlackChannelMessage.mockResolvedValue(undefined);
  });

  it("fails closed when Slack env credentials are incomplete", async () => {
    envState.SLACK_CLIENT_SECRET = undefined;

    const result = await runWorkspaceAutomationSlackNotificationTool({
      organizationId: "org-1",
      channelId: "C123",
      message: "Run finished",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "slack_send_failed",
        message: "Slack is not configured for this environment.",
      });
    }
    expect(mocks.postSlackChannelMessage).not.toHaveBeenCalled();
  });

  it("posts to the channel when Slack is configured", async () => {
    const result = await runWorkspaceAutomationSlackNotificationTool({
      organizationId: "org-1",
      channelId: "C123",
      message: "Run finished",
    });

    expect(isOk(result)).toBe(true);
    expect(mocks.postSlackChannelMessage).toHaveBeenCalledWith({
      organizationId: "org-1",
      channelId: "C123",
      text: "Run finished",
    });
  });
});

describe("runWorkspaceAutomationEmailNotificationTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEmailPipesApiKey.mockResolvedValue({ ok: true, value: "re_test_key" });
    mocks.sendTransactionalEmail.mockResolvedValue({ ok: true, value: undefined });
  });

  it("loads the provider API key from Pipes and sends the email", async () => {
    const result = await runWorkspaceAutomationEmailNotificationTool({
      organizationId: "org-1",
      provider: "resend",
      workosUserId: "user_workos_1",
      from: "notifications@example.com",
      recipients: ["ops@example.com", "qa@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isOk(result)).toBe(true);
    expect(mocks.loadEmailPipesApiKey).toHaveBeenCalledWith({
      provider: "resend",
      localOrganizationId: "org-1",
      workosUserId: "user_workos_1",
    });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith({
      provider: "resend",
      apiKey: "re_test_key",
      from: "notifications@example.com",
      recipients: ["ops@example.com", "qa@example.com"],
      subject: "Automation complete",
      message: "All good",
    });
  });

  it("maps Pipes credential errors without calling send", async () => {
    mocks.loadEmailPipesApiKey.mockResolvedValue({
      ok: false,
      error: {
        code: "email_provider_not_connected",
        message: "Connect this provider in Integrations before using it.",
      },
    });

    const result = await runWorkspaceAutomationEmailNotificationTool({
      organizationId: "org-1",
      provider: "sendgrid",
      workosUserId: "user_workos_1",
      from: "notifications@example.com",
      recipients: ["ops@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("email_provider_not_connected");
    }
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
