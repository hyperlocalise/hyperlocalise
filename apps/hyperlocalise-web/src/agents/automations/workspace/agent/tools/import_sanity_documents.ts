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
import { runImportSanityDocuments } from "@/lib/sanity/import-sanity-documents";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readImportSanityDocuments,
} from "../workspace-orchestrator-output-summary";

export function createImportSanityDocumentsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import changed Sanity documents into the attached project as JSON source files, wait for ingest, and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const sanity = session.automation.toolConfig.sanity;
      if (!sanity?.enabled) {
        throw new Error("import_sanity_documents_not_configured");
      }

      const existingOutput = readImportSanityDocuments(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.import_sanity_documents = existingOutput;
        return existingOutput;
      }

      const result = await runImportSanityDocuments({
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
        session.terminalError = "sanity_import_failed";
      }

      session.stepResults.import_sanity_documents = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importSanityDocuments: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { importSanityDocuments: output });

      return output;
    },
  });
}
