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
import { runPushGoogleDriveTranslations } from "@/lib/google-drive/push-google-drive-translations";

import type { WorkspaceOrchestratorSession } from "../context";

export function createPushGoogleDriveTranslationsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push translated project files back to Google Drive using the automation Translation output setting: [fr] Report.docx, Report [fr].docx, Report_fr.docx, or fr/Report.docx.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const googleDrive = session.automation.toolConfig.googleDrive;
      if (!googleDrive?.enabled) {
        throw new Error("push_google_drive_translations_not_configured");
      }

      const result = await runPushGoogleDriveTranslations({
        organizationId: session.organizationId,
        automation: session.automation,
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failed > 0 && result.pushed === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "google_drive_push_failed";
      }

      session.stepResults.push_google_drive_translations = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushGoogleDriveTranslations: output,
        },
      });

      return output;
    },
  });
}
