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
import { runPushIntercomTranslations } from "@/lib/intercom/push-intercom-translations";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushIntercomTranslations,
} from "../workspace-orchestrator-output-summary";

export function createPushIntercomTranslationsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved project translations for mapped Intercom articles as Intercom translated_content drafts.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const intercom = session.automation.toolConfig.intercom;
      if (!intercom?.enabled) {
        throw new Error("push_intercom_translations_not_configured");
      }

      const existingOutput = readPushIntercomTranslations(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.push_intercom_translations = existingOutput;
        return existingOutput;
      }

      const result = await runPushIntercomTranslations({
        organizationId: session.organizationId,
        automation: session.automation,
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      session.stepResults.push_intercom_translations = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushIntercomTranslations: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushIntercomTranslations: output });

      return output;
    },
  });
}
