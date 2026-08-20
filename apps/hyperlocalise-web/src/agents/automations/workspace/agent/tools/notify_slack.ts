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
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { runWorkspaceAutomationSlackNotificationTool } from "@/lib/agents/workspace-automation/notification-tools";

import type { WorkspaceOrchestratorSession } from "../context";
import { buildOrchestratorRunSummaryMessage } from "../summary-message";

export function createNotifySlackTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Send a Slack notification summarizing this automation run to the configured channel. Pass `message` as scannable Markdown. Follow any customer-specified Slack format first; otherwise use a bold headline, short bullets, and a next step. Do not send one dense paragraph.",
    inputSchema: z.object({
      message: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Markdown summary for Slack. Prefer the customer's requested format when provided; otherwise a bold headline, short bullets for key facts, and a one-line next step.",
        ),
    }),
    execute: async ({ message }) => {
      const slack = session.automation.toolConfig.slack;
      if (!slack?.enabled || !slack.channelId) {
        throw new Error("slack_not_configured");
      }

      const text = message?.trim() || buildOrchestratorRunSummaryMessage(session);
      const result = await runWorkspaceAutomationSlackNotificationTool({
        organizationId: session.organizationId,
        channelId: slack.channelId,
        message: text,
      });

      const payload = result.ok
        ? { sent: true, channelId: slack.channelId }
        : {
            sent: false,
            channelId: slack.channelId,
            code: result.error.code,
            message: result.error.message,
          };

      session.stepResults.notify_slack = payload;
      return payload;
    },
  });
}
