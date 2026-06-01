import { Resend } from "resend";

import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { getSlackBot } from "./slack/bot";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "./workspace-automations";

const logger = createLogger("workspace-automation-notifications");

export type WorkspaceAutomationNotificationError = {
  code: "slack_send_failed" | "email_send_failed" | "notifications_not_configured";
  message: string;
};

function buildRunSummaryMessage(input: {
  automation: WorkspaceAutomationRecord;
  run: WorkspaceAutomationRunRecord;
}) {
  const statusLabel = input.run.status.toUpperCase();
  const lines = [
    `Automation "${input.automation.name}" finished with status ${statusLabel}.`,
    `Trigger: ${input.run.triggerSource}.`,
  ];

  if (input.run.outputSummary && Object.keys(input.run.outputSummary).length > 0) {
    lines.push(`Summary: ${JSON.stringify(input.run.outputSummary)}`);
  }

  if (input.run.error) {
    lines.push(`Error: ${JSON.stringify(input.run.error)}`);
  }

  return lines.join("\n");
}

async function sendSlackNotification(input: {
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
    const bot = await getSlackBot();
    await bot.initialize();
    const adapter = bot.getAdapter("slack");
    const postChannelMessage = (
      adapter as unknown as {
        postMessage?: (channelId: string, message: string) => Promise<void>;
      }
    ).postMessage;
    if (!postChannelMessage) {
      return err({
        code: "slack_send_failed",
        message: "Slack adapter does not support channel notifications.",
      });
    }

    await postChannelMessage(input.channelId, input.message);
    return ok(undefined);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "workspace automation slack notification failed",
    );
    return err({
      code: "slack_send_failed",
      message: error instanceof Error ? error.message : "Slack notification failed.",
    });
  }
}

async function sendEmailNotification(input: {
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

export async function notifyWorkspaceAutomationTerminalRun(input: {
  automation: WorkspaceAutomationRecord;
  run: WorkspaceAutomationRunRecord;
}): Promise<Record<string, unknown>> {
  const terminalStatuses = new Set(["succeeded", "failed", "skipped"]);
  if (!terminalStatuses.has(input.run.status)) {
    return {};
  }

  const message = buildRunSummaryMessage(input);
  const warnings: Array<{ channel: "slack" | "email"; code: string; message: string }> = [];

  const slack = input.automation.toolConfig.slack;
  if (slack?.enabled && slack.channelId) {
    const result = await sendSlackNotification({
      channelId: slack.channelId,
      message,
    });
    if (!result.ok) {
      warnings.push({
        channel: "slack",
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const email = input.automation.toolConfig.email;
  if (email?.enabled && email.recipients && email.recipients.length > 0) {
    const result = await sendEmailNotification({
      recipients: email.recipients,
      subject: `Automation run ${input.run.status}: ${input.automation.name}`,
      message,
    });
    if (!result.ok) {
      warnings.push({
        channel: "email",
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  return warnings.length > 0 ? { notificationWarnings: warnings } : {};
}
