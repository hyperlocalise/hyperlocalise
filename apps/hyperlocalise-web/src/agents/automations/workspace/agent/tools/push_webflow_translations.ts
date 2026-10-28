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
  readWebflowPushSourcePaths,
  runPushWebflowTranslations,
} from "@/lib/webflow/push-webflow-translations";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushWebflowTranslations,
} from "../workspace-orchestrator-output-summary";

export function createPushWebflowTranslationsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved Webflow CMS translations to staged secondary locales. Never runs automatically on import.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const webflow = session.automation.toolConfig.webflow;
      if (!webflow?.enabled) {
        throw new Error("push_webflow_translations_not_configured");
      }

      const existingOutput = readPushWebflowTranslations(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.push_webflow_translations = existingOutput;
        return existingOutput;
      }

      const result = await runPushWebflowTranslations({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readWebflowPushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "webflow_push_failed";
      }

      session.stepResults.push_webflow_translations = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushWebflowTranslations: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushWebflowTranslations: output });

      return output;
    },
  });
}
