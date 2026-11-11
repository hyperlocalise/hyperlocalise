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
import { runImportIterableTemplates } from "@/lib/iterable/import-iterable-templates";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readImportIterableTemplates,
} from "../workspace-orchestrator-output-summary";

export function createImportIterableTemplatesTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import Iterable templates and snippets into the attached native project as source files.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const iterable = session.automation.toolConfig.iterable;
      if (!iterable?.enabled) {
        throw new Error("import_iterable_templates_not_configured");
      }

      const existingOutput = readImportIterableTemplates(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.import_iterable_templates = existingOutput;
        return existingOutput;
      }

      const result = await runImportIterableTemplates({
        organizationId: session.organizationId,
        automation: session.automation,
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failed > 0 && result.imported === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "iterable_import_failed";
      }

      session.stepResults.import_iterable_templates = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importIterableTemplates: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { importIterableTemplates: output });

      return output;
    },
  });
}
