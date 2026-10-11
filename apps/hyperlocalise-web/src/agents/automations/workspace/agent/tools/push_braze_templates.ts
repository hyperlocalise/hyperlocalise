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
import { readBrazePushSourcePaths, runPushBrazeTemplates } from "@/lib/braze/push-braze-templates";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushBrazeTemplates,
} from "../workspace-orchestrator-output-summary";

export function createPushBrazeTemplatesTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved translations as locale-suffixed Braze email template and Content Block copies. Never updates the source template.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const braze = session.automation.toolConfig.braze;
      if (!braze?.enabled) {
        throw new Error("push_braze_templates_not_configured");
      }

      const existingOutput = readPushBrazeTemplates(session.run.outputSummary, session.stepResults);
      if (existingOutput) {
        session.stepResults.push_braze_templates = existingOutput;
        return existingOutput;
      }

      const result = await runPushBrazeTemplates({
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

      session.stepResults.push_braze_templates = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushBrazeTemplates: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushBrazeTemplates: output });

      return output;
    },
  });
}
