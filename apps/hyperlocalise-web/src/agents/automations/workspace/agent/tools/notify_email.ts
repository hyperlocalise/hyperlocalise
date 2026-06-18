import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { runWorkspaceAutomationEmailNotificationTool } from "@/lib/agents/workspace-automation/notification-tools";

import type { WorkspaceOrchestratorSession } from "../context";
import { buildOrchestratorRunSummaryMessage } from "../summary-message";

export function createNotifyEmailTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Send an email notification summarizing this automation run to configured recipients.",
    inputSchema: z.object({
      message: z.string().trim().min(1).optional(),
      subject: z.string().trim().min(1).optional(),
    }),
    execute: async ({ message, subject }) => {
      const email = session.automation.toolConfig.email;
      if (!email?.enabled || !email.recipients || email.recipients.length === 0) {
        throw new Error("email_not_configured");
      }

      const text = message?.trim() || buildOrchestratorRunSummaryMessage(session);
      const resolvedSubject =
        subject?.trim() ||
        `Automation run ${session.terminalStatus ?? session.run.status}: ${session.automation.name}`;

      const result = await runWorkspaceAutomationEmailNotificationTool({
        recipients: email.recipients,
        subject: resolvedSubject,
        message: text,
      });

      const payload = result.ok
        ? { sent: true, recipientCount: email.recipients.length }
        : {
            sent: false,
            recipientCount: email.recipients.length,
            code: result.error.code,
            message: result.error.message,
          };

      session.stepResults.notify_email = payload;
      return payload;
    },
  });
}
