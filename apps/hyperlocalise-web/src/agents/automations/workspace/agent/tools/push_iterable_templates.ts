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
  readIterablePushSourcePaths,
  runPushIterableTemplates,
} from "@/lib/iterable/push-iterable-templates";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readPushIterableTemplates,
} from "../workspace-orchestrator-output-summary";

export function createPushIterableTemplatesTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Push approved translations as locale-suffixed Iterable email template and Content Block copies. Never updates the source template.",
    inputSchema: z.object({
      summary: z.string().optional().describe("Optional operator note for the run record."),
    }),
    execute: async ({ summary }) => {
      const iterable = session.automation.toolConfig.iterable;
      if (!iterable?.enabled) {
        throw new Error("push_iterable_templates_not_configured");
      }

      const existingOutput = readPushIterableTemplates(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.push_iterable_templates = existingOutput;
        return existingOutput;
      }

      const result = await runPushIterableTemplates({
        organizationId: session.organizationId,
        automation: session.automation,
        sourcePaths: readIterablePushSourcePaths(session.run.inputSnapshot),
      });

      const output = {
        ...result,
        summary: summary?.trim() || undefined,
      };

      if (result.failedLocales > 0 && result.pushedLocales === 0) {
        session.terminalStatus = "failed";
        session.terminalError = "iterable_push_failed";
      }

      session.stepResults.push_iterable_templates = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          pushIterableTemplates: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { pushIterableTemplates: output });

      return output;
    },
  });
}
