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
import { runImportBrazeCampaigns } from "@/lib/braze/import-braze-campaigns";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readImportBrazeCampaigns,
} from "../workspace-orchestrator-output-summary";

export function createImportBrazeCampaignsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import tagged Braze campaign and Canvas draft message variations into the attached project as JSON translation maps, wait for ingest, and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const braze = session.automation.toolConfig.brazeCampaigns;
      if (!braze?.enabled) {
        throw new Error("import_braze_campaigns_not_configured");
      }

      const existingOutput = readImportBrazeCampaigns(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.import_braze_campaigns = existingOutput;
        return existingOutput;
      }

      const result = await runImportBrazeCampaigns({
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
        session.terminalError = "braze_import_failed";
      }

      session.stepResults.import_braze_campaigns = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importBrazeCampaigns: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { importBrazeCampaigns: output });

      return output;
    },
  });
}
