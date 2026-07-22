/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";
import { enqueueExistingFileTranslationJob } from "@/lib/projects/jobs/enqueue-file-translation-job";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readAssignTranslateWithAgent,
  readCreateNativeTmsJob,
} from "../workspace-orchestrator-output-summary";

const jobQueue = createTranslationJobEventQueue();

export function createAssignTranslateWithAgentTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Assign a native TMS file translation job to the Hyperlocalise translation agent and start translation.",
    inputSchema: z.object({
      jobId: z
        .string()
        .optional()
        .describe(
          "Native job ID to translate. Defaults to the job created earlier in this automation run.",
        ),
      summary: z
        .string()
        .optional()
        .describe("Optional operator note to include in the run record."),
    }),
    execute: async ({ jobId, summary }) => {
      const translationConfig = session.automation.toolConfig.translation;
      if (!translationConfig?.enabled || !translationConfig.projectId) {
        throw new Error("translation_workflow_not_configured");
      }

      const existingOutput = readAssignTranslateWithAgent(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.assign_translate_with_agent = existingOutput;
        return existingOutput;
      }

      const createdJob = readCreateNativeTmsJob(session.run.outputSummary, session.stepResults);
      const resolvedJobId =
        jobId?.trim() || (typeof createdJob?.jobId === "string" ? createdJob.jobId : null) || null;

      if (!resolvedJobId) {
        throw new Error("native_tms_job_missing");
      }

      const result = await enqueueExistingFileTranslationJob({
        organizationId: session.organizationId,
        jobId: resolvedJobId,
        jobQueue,
      });

      if (!result.ok) {
        throw new Error(result.code);
      }

      const output = {
        jobId: result.jobId,
        projectId: result.projectId,
        action: "translate_with_agent",
        enqueued: true,
        summary: summary?.trim() || undefined,
      };

      session.stepResults.assign_translate_with_agent = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          assignTranslateWithAgent: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { assignTranslateWithAgent: output });

      return output;
    },
  });
}
