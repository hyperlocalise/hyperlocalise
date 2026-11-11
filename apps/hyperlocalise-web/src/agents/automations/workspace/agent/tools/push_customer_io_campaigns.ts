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
  runPushCustomerIoCampaigns,
  readCustomerIoPushSourcePaths,
} from "@/lib/customer-io/push-customer-io-campaigns";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushCustomerIoCampaigns,
} from "../workspace-orchestrator-output-summary";

export function createPushCustomerIoCampaignsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved locales into Customer.io campaign, newsletter, broadcast, and transactional messages. Never rewrites message content and never publishes.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const customerIo = session.automation.toolConfig.customerIo;
      if (!customerIo?.enabled || !customerIo.workosUserId) {
        throw new Error("push_customer_io_campaigns_not_configured");
      }

      const existingOutput = readPushCustomerIoCampaigns(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.push_customer_io_campaigns = existingOutput;
        return existingOutput;
      }

      const result = await runPushCustomerIoCampaigns({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readCustomerIoPushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "customer_io_push_failed";
      }

      session.stepResults.push_customer_io_campaigns = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushCustomerIoCampaigns: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushCustomerIoCampaigns: output });

      return output;
    },
  });
}
