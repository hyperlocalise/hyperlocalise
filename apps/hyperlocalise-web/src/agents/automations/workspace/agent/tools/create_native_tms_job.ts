import { eq } from "drizzle-orm";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { db, schema } from "@/lib/database";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";
import { createFileTranslationJob } from "@/lib/projects/jobs/enqueue-file-translation-job";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readCreateNativeTmsJob,
} from "../workspace-orchestrator-output-summary";

export function createNativeTmsJobTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Create a Hyperlocalise native TMS file translation job for an uploaded source file. Does not start translation.",
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

      const existingOutput = readCreateNativeTmsJob(
        session.run.outputSummary,
        session.stepResults,
      );
      if (existingOutput) {
        session.stepResults.create_native_tms_job = existingOutput;
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
      const result = await createFileTranslationJob({
        organizationId: session.organizationId,
        projectId,
        sourceFileId,
        sourceLocale,
        targetLocales: configuredLocales,
      });

      if (!result.ok) {
        throw new Error(result.code);
      }

      const output = {
        jobId: result.jobId,
        projectId: result.projectId,
        sourceFileId,
        sourceFileVersionId: result.sourceFileVersionId ?? sourceFileVersionId,
        targetLocales: configuredLocales,
        summary: summary?.trim() || undefined,
      };

      session.stepResults.create_native_tms_job = output;

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        outputSummary: {
          ...session.run.outputSummary,
          createNativeTmsJob: output,
        },
      });
      mergeToolOutputSummaryIntoSessionRun(session, { createNativeTmsJob: output });

      return output;
    },
  });
}
