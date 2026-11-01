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
  readHubspotPushSourcePaths,
  runPushHubspotContent,
} from "@/lib/hubspot/push-hubspot-content";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushHubspotContent,
} from "../workspace-orchestrator-output-summary";

export function createPushHubspotContentTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved HubSpot translations as locale copies. Never edits the source object and never publishes or sends.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const hubspot = session.automation.toolConfig.hubspot;
      if (!hubspot?.enabled) {
        throw new Error("push_hubspot_content_not_configured");
      }

      const existingOutput = readPushHubspotContent(session.run.outputSummary, session.stepResults);
      if (existingOutput) {
        session.stepResults.push_hubspot_content = existingOutput;
        return existingOutput;
      }

      const result = await runPushHubspotContent({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readHubspotPushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "hubspot_push_failed";
      }

      session.stepResults.push_hubspot_content = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushHubspotContent: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushHubspotContent: output });

      return output;
    },
  });
}
