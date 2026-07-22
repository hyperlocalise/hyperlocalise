/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  runWorkspaceAutomationEmailNotificationTool,
  runWorkspaceAutomationSlackNotificationTool,
} from "./workspace-automation/notification-tools";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "./workspace-automations";

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
    const result = await runWorkspaceAutomationSlackNotificationTool({
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
    const result = await runWorkspaceAutomationEmailNotificationTool({
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
