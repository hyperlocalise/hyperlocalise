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
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";
import {
  readMailchimpPushSourcePaths,
  runPushMailchimpContent,
} from "@/lib/mailchimp/push-mailchimp-content";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushMailchimpContent,
} from "../workspace-orchestrator-output-summary";

export function createPushMailchimpContentTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved Mailchimp translations as locale copies. Never edits the source object and never sends or schedules campaigns.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const mailchimp = session.automation.toolConfig.mailchimp;
      if (!mailchimp?.enabled) {
        throw new Error("push_mailchimp_content_not_configured");
      }

      const existingOutput = readPushMailchimpContent(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.push_mailchimp_content = existingOutput;
        return existingOutput;
      }

      const result = await runPushMailchimpContent({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readMailchimpPushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = result.warnings[0] || "mailchimp_push_failed";
      }

      session.stepResults.push_mailchimp_content = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushMailchimpContent: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushMailchimpContent: output });

      return output;
    },
  });
}
