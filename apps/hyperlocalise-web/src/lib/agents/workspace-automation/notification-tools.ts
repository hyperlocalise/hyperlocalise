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
import { loadEmailPipesApiKey } from "@/lib/email/pipes";
import { sendTransactionalEmail } from "@/lib/email/send";
import type { EmailProviderSlug } from "@/lib/email/constants";
import type { EmailPipesError, EmailSendError } from "@/lib/email/types";
import { env } from "@/lib/env";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

export type WorkspaceAutomationNotificationError =
  | { code: "slack_send_failed"; message: string }
  | EmailSendError
  | EmailPipesError
  | { code: "notifications_not_configured"; message: string };

export async function runWorkspaceAutomationSlackNotificationTool(input: {
  organizationId: string;
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
    await postSlackChannelMessage({
      organizationId: input.organizationId,
      channelId: input.channelId,
      text: input.message,
    });
    return ok(undefined);
  } catch (error) {
    return err({
      code: "slack_send_failed",
      message: error instanceof Error ? error.message : "Slack notification failed.",
    });
  }
}

export async function runWorkspaceAutomationEmailNotificationTool(input: {
  organizationId: string;
  provider: EmailProviderSlug;
  workosUserId: string;
  from: string;
  recipients: string[];
  subject: string;
  message: string;
}): Promise<Result<void, WorkspaceAutomationNotificationError>> {
  const apiKeyResult = await loadEmailPipesApiKey({
    provider: input.provider,
    localOrganizationId: input.organizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(apiKeyResult)) {
    return apiKeyResult;
  }

  return sendTransactionalEmail({
    provider: input.provider,
    apiKey: apiKeyResult.value,
    from: input.from,
    recipients: input.recipients,
    subject: input.subject,
    message: input.message,
  });
}
