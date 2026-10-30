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
import { runImportHubspotContent } from "@/lib/hubspot/import-hubspot-content";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readImportHubspotContent,
} from "../workspace-orchestrator-output-summary";

export function createImportHubspotContentTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import HubSpot marketing emails, forms, blog posts, landing pages, and website pages into the attached project, wait for ingest, and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const hubspot = session.automation.toolConfig.hubspot;
      if (!hubspot?.enabled) {
        throw new Error("import_hubspot_content_not_configured");
      }

      const existingOutput = readImportHubspotContent(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.import_hubspot_content = existingOutput;
        return existingOutput;
      }

      const result = await runImportHubspotContent({
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
        session.terminalError = "hubspot_import_failed";
      }

      session.stepResults.import_hubspot_content = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importHubspotContent: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { importHubspotContent: output });

      return output;
    },
  });
}
