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
import { runImportStoryblokStories } from "@/lib/storyblok/import-storyblok-stories";

import type { WorkspaceOrchestratorSession } from "../context";

export function createImportStoryblokStoriesTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Import changed Storyblok stories into the attached project as JSON source files and open native translation jobs when configured.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const storyblok = session.automation.toolConfig.storyblok;
      if (!storyblok?.enabled) {
        throw new Error("import_storyblok_stories_not_configured");
      }

      const result = await runImportStoryblokStories({
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
        session.terminalError = "storyblok_import_failed";
      }

      session.stepResults.import_storyblok_stories = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          importStoryblokStories: output,
        },
      });

      return output;
    },
  });
}
