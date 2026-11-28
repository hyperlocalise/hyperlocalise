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
  readStoryblokPushSourcePaths,
  runPushStoryblokTranslations,
} from "@/lib/storyblok/push-storyblok-translations";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushStoryblokTranslations,
} from "../workspace-orchestrator-output-summary";

export function createPushStoryblokTranslationsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved translations to Storyblok stories as field-level translations. Never runs automatically on import.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const storyblok = session.automation.toolConfig.storyblok;
      if (!storyblok?.enabled) {
        throw new Error("push_storyblok_translations_not_configured");
      }

      const existingOutput = readPushStoryblokTranslations(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.push_storyblok_translations = existingOutput;
        return existingOutput;
      }

      const result = await runPushStoryblokTranslations({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readStoryblokPushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "storyblok_push_failed";
      }

      session.stepResults.push_storyblok_translations = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushStoryblokTranslations: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushStoryblokTranslations: output });

      return output;
    },
  });
}
