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
import { readBrazePushSourcePaths, runPushBrazeCampaigns } from "@/lib/braze/push-braze-campaigns";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushBrazeCampaigns,
} from "../workspace-orchestrator-output-summary";

export function createPushBrazeCampaignsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved locales into Braze campaign and Canvas translation maps. Never rewrites message HTML and never publishes.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const braze = session.automation.toolConfig.brazeCampaigns;
      if (!braze?.enabled) {
        throw new Error("push_braze_campaigns_not_configured");
      }

      const existingOutput = readPushBrazeCampaigns(session.run.outputSummary, session.stepResults);
      if (existingOutput) {
        session.stepResults.push_braze_campaigns = existingOutput;
        return existingOutput;
      }

      const result = await runPushBrazeCampaigns({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readBrazePushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "braze_push_failed";
      }

      session.stepResults.push_braze_campaigns = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushBrazeCampaigns: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushBrazeCampaigns: output });

      return output;
    },
  });
}
