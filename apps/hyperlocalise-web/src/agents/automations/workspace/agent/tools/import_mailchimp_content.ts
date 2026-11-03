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
import { runImportMailchimpContent } from "@/lib/mailchimp/import-mailchimp-content";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readImportMailchimpContent,
} from "../workspace-orchestrator-output-summary";

export function createImportMailchimpContentTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import Mailchimp campaigns and user templates into the attached project, wait for ingest, and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const mailchimp = session.automation.toolConfig.mailchimp;
      if (!mailchimp?.enabled) {
        throw new Error("import_mailchimp_content_not_configured");
      }

      const existingOutput = readImportMailchimpContent(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.import_mailchimp_content = existingOutput;
        return existingOutput;
      }

      const result = await runImportMailchimpContent({
        organizationId: session.organizationId,
        automation: session.automation,
        workflowRunId: session.run.id,
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failed > 0 && result.imported === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "mailchimp_import_failed";
      }

      session.stepResults.import_mailchimp_content = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importMailchimpContent: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { importMailchimpContent: output });

      return output;
    },
  });
}
