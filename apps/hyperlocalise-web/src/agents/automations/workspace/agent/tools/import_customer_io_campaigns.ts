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
import { runImportCustomerIoCampaigns } from "@/lib/customer-io/import-customer-io-campaigns";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readImportCustomerIoCampaigns,
} from "../workspace-orchestrator-output-summary";

export function createImportCustomerIoCampaignsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import Customer.io campaign, newsletter, broadcast, and transactional message actions into the attached project as JSON translation maps or HTML email files, wait for ingest, and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const customerIo = session.automation.toolConfig.customerIo;
      if (!customerIo?.enabled) {
        throw new Error("import_customer_io_campaigns_not_configured");
      }

      const existingOutput = readImportCustomerIoCampaigns(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.import_customer_io_campaigns = existingOutput;
        return existingOutput;
      }

      const result = await runImportCustomerIoCampaigns({
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
        session.terminalError = "customer_io_import_failed";
      }

      session.stepResults.import_customer_io_campaigns = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importCustomerIoCampaigns: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { importCustomerIoCampaigns: output });

      return output;
    },
  });
}
