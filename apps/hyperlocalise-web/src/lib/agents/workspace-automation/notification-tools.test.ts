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
  RESEND_API_KEY: "re_test_key" as string | undefined,
  RESEND_FROM_ADDRESS: "notifications@example.com" as string | undefined,
  RESEND_FROM_NAME: "Hyperlocalise" as string | undefined,
}));

const mocks = vi.hoisted(() => ({
  postSlackChannelMessage: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: envState,
}));

vi.mock("@/lib/agents/slack/post-channel-message", () => ({
  postSlackChannelMessage: (...args: unknown[]) => mocks.postSlackChannelMessage(...args),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: (...args: unknown[]) => mocks.resendSend(...args),
    };
  },
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

  it("maps thrown Slack delivery errors to slack_send_failed", async () => {
    mocks.postSlackChannelMessage.mockRejectedValue(new Error("channel_not_found"));

    const result = await runWorkspaceAutomationSlackNotificationTool({
      organizationId: "org-1",
      channelId: "C404",
      message: "Run finished",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "slack_send_failed",
        message: "channel_not_found",
      });
    }
  });

  it("uses a stable fallback message for non-Error Slack failures", async () => {
    mocks.postSlackChannelMessage.mockRejectedValue("boom");

    const result = await runWorkspaceAutomationSlackNotificationTool({
      organizationId: "org-1",
      channelId: "C123",
      message: "Run finished",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "slack_send_failed",
        message: "Slack notification failed.",
      });
    }
  });
});

describe("runWorkspaceAutomationEmailNotificationTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.RESEND_API_KEY = "re_test_key";
    envState.RESEND_FROM_ADDRESS = "notifications@example.com";
    envState.RESEND_FROM_NAME = "Hyperlocalise";
    mocks.resendSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  it("fails closed when Resend is not configured", async () => {
    envState.RESEND_API_KEY = undefined;

    const result = await runWorkspaceAutomationEmailNotificationTool({
      recipients: ["ops@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "email_send_failed",
        message: "Email delivery is not configured for this environment.",
      });
    }
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("sends with a display name when RESEND_FROM_NAME is set", async () => {
    const result = await runWorkspaceAutomationEmailNotificationTool({
      recipients: ["ops@example.com", "qa@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isOk(result)).toBe(true);
    expect(mocks.resendSend).toHaveBeenCalledWith({
      from: "Hyperlocalise <notifications@example.com>",
      to: ["ops@example.com", "qa@example.com"],
      subject: "Automation complete",
      text: "All good",
    });
  });

  it("falls back to the bare from address when RESEND_FROM_NAME is unset", async () => {
    envState.RESEND_FROM_NAME = undefined;

    const result = await runWorkspaceAutomationEmailNotificationTool({
      recipients: ["ops@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isOk(result)).toBe(true);
    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "notifications@example.com",
      }),
    );
  });

  it("maps Resend API error payloads to email_send_failed", async () => {
    mocks.resendSend.mockResolvedValue({
      data: null,
      error: { message: "Invalid API key" },
    });

    const result = await runWorkspaceAutomationEmailNotificationTool({
      recipients: ["ops@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "email_send_failed",
        message: "Invalid API key",
      });
    }
  });

  it("maps thrown Resend failures to email_send_failed", async () => {
    mocks.resendSend.mockRejectedValue(new Error("network down"));

    const result = await runWorkspaceAutomationEmailNotificationTool({
      recipients: ["ops@example.com"],
      subject: "Automation complete",
      message: "All good",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "email_send_failed",
        message: "network down",
      });
    }
  });
});
