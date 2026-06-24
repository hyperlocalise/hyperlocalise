import { eq } from "drizzle-orm";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { db, schema } from "@/lib/database";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";
import { enqueueFileTranslationJob } from "@/lib/projects/jobs/enqueue-file-translation-job";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readCreateTranslationJobs,
} from "../workspace-orchestrator-output-summary";

const jobQueue = createTranslationJobEventQueue();

export function createTranslationJobsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Create file translation jobs for uploaded source files when this automation is triggered by a source upload.",
    inputSchema: z.object({
      summary: z
        .string()
        .optional()
        .describe("Optional operator note to include in the run record."),
    }),
    execute: async ({ summary }) => {
      const translationConfig = session.automation.toolConfig.translation;
      if (!translationConfig?.enabled || !translationConfig.projectId) {
        throw new Error("translation_workflow_not_configured");
      }

      const existingOutput = readCreateTranslationJobs(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.create_translation_jobs = existingOutput;
        return existingOutput;
      }

      const snapshot = session.run.inputSnapshot;
      const sourceFileId = typeof snapshot.sourceFileId === "string" ? snapshot.sourceFileId : null;
      const sourceFileVersionId =
        typeof snapshot.sourceFileVersionId === "string" ? snapshot.sourceFileVersionId : null;
      const projectId =
        typeof snapshot.projectId === "string" ? snapshot.projectId : translationConfig.projectId;

      if (!sourceFileId || !sourceFileVersionId) {
        throw new Error("source_upload_context_missing");
      }

      const [project] = await db
        .select({
          sourceLocale: schema.projects.sourceLocale,
          targetLocales: schema.projects.targetLocales,
        })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new Error("translation_project_not_found");
      }

      const configuredLocales = translationConfig.useProjectTargetLocales
        ? Array.isArray(project.targetLocales)
          ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
          : []
        : translationConfig.targetLocales;

      if (configuredLocales.length === 0) {
        throw new Error("translation_target_locales_missing");
      }

      const sourceLocale = project.sourceLocale?.trim() || "en";
      const result = await enqueueFileTranslationJob({
        organizationId: session.organizationId,
        projectId,
        sourceFileId,
        sourceLocale,
        targetLocales: configuredLocales,
        jobQueue,
      });

      if (!result.ok) {
        throw new Error(result.code);
      }

      const output = {
        jobId: result.jobId,
        projectId,
        sourceFileId,
        sourceFileVersionId,
        targetLocales: configuredLocales,
        summary: summary?.trim() || undefined,
      };

      session.stepResults.create_translation_jobs = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          createTranslationJobs: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { createTranslationJobs: output });

      return output;
    },
  });
}
