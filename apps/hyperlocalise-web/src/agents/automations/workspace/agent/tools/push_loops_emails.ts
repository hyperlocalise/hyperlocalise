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
import { readLoopsPushSourcePaths, runPushLoopsEmails } from "@/lib/loops/push-loops-emails";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushLoopsEmails,
} from "../workspace-orchestrator-output-summary";

export function createPushLoopsEmailsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved Loops email translations as unpublished locale copies. Never changes the source email.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const loops = session.automation.toolConfig.loops;
      if (!loops?.enabled) {
        throw new Error("push_loops_emails_not_configured");
      }

      const existingOutput = readPushLoopsEmails(session.run.outputSummary, session.stepResults);
      if (existingOutput) {
        session.stepResults.push_loops_emails = existingOutput;
        return existingOutput;
      }

      const result = await runPushLoopsEmails({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readLoopsPushSourcePaths(session.run.inputSnapshot),
        workflowRunId: session.run.id,
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "loops_push_failed";
      }

      session.stepResults.push_loops_emails = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushLoopsEmails: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushLoopsEmails: output });

      return output;
    },
  });
}
