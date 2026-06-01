import { Resend } from "resend";

import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type WorkspaceAutomationNotificationError = {
  code: "slack_send_failed" | "email_send_failed" | "notifications_not_configured";
  message: string;
};

export async function runWorkspaceAutomationSlackNotificationTool(input: {
  channelId: string;
  message: string;
}): Promise<Result<void, WorkspaceAutomationNotificationError>> {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_SIGNING_SECRET) {
    return err({
      code: "slack_send_failed",
      message: "Slack is not configured for this environment.",
    });
  }

  try {
    const { postSlackChannelMessage } = await import("@/lib/agents/slack/post-channel-message");
    await postSlackChannelMessage({ channelId: input.channelId, text: input.message });
    return ok(undefined);
  } catch (error) {
    return err({
      code: "slack_send_failed",
      message: error instanceof Error ? error.message : "Slack notification failed.",
    });
  }
}

export async function runWorkspaceAutomationEmailNotificationTool(input: {
  recipients: string[];
  subject: string;
  message: string;
}): Promise<Result<void, WorkspaceAutomationNotificationError>> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_ADDRESS) {
    return err({
      code: "email_send_failed",
      message: "Email delivery is not configured for this environment.",
    });
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: env.RESEND_FROM_NAME
        ? `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_ADDRESS}>`
        : env.RESEND_FROM_ADDRESS,
      to: input.recipients,
      subject: input.subject,
      text: input.message,
    });

    if (result.error) {
      return err({
        code: "email_send_failed",
        message: result.error.message,
      });
    }

    return ok(undefined);
  } catch (error) {
    return err({
      code: "email_send_failed",
      message: error instanceof Error ? error.message : "Email notification failed.",
    });
  }
}
