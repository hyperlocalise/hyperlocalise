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
import { runImportWebflowItems } from "@/lib/webflow/import-webflow-items";

import type { WorkspaceOrchestratorSession } from "../context";

export function createImportWebflowItemsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import changed Webflow CMS collection items into the attached project as JSON source files and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const webflow = session.automation.toolConfig.webflow;
      if (!webflow?.enabled) {
        throw new Error("import_webflow_items_not_configured");
      }

      const result = await runImportWebflowItems({
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
        session.terminalError = "webflow_import_failed";
      }

      session.stepResults.import_webflow_items = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importWebflowItems: output,
        },
      });

      return output;
    },
  });
}
