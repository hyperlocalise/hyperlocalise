import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { runWorkspaceAutomationSlackNotificationTool } from "@/lib/agents/workspace-automation/notification-tools";

import type { WorkspaceOrchestratorSession } from "../context";
import { buildOrchestratorRunSummaryMessage } from "../summary-message";

export function createNotifySlackTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Send a Slack notification summarizing this automation run to the configured channel.",
    inputSchema: z.object({
      message: z.string().trim().min(1).optional(),
    }),
    execute: async ({ message }) => {
      const slack = session.automation.toolConfig.slack;
      if (!slack?.enabled || !slack.channelId) {
        throw new Error("slack_not_configured");
      }

      const text = message?.trim() || buildOrchestratorRunSummaryMessage(session);
      const result = await runWorkspaceAutomationSlackNotificationTool({
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
