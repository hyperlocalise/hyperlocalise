import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { runContentfulAgent } from "@/agents/automations/contentful/agent/run-contentful-agent";
import { createContentfulTranslationRun } from "@/lib/contentful/automation-executor";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";

function resolveContentfulEntryId(session: WorkspaceOrchestratorSession) {
  const snapshot = session.run.inputSnapshot;
  if (typeof snapshot.entryId === "string" && snapshot.entryId.trim()) {
    return snapshot.entryId.trim();
  }

  return session.automation.toolConfig.contentful?.entryId?.trim() ?? null;
}

export function createRunContentfulTranslationTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Translate the configured Contentful entry into target locales, run QA when enabled, and write drafts.",
    inputSchema: z.object({
      entryId: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Optional entry ID override; defaults to the trigger payload or automation config.",
        ),
    }),
    execute: async ({ entryId: entryIdOverride }) => {
      const contentful = session.automation.toolConfig.contentful;
      if (!contentful?.enabled || !contentful.connectionId || !contentful.projectId) {
        throw new Error("contentful_workflow_not_configured");
      }

      const sourceLocale = contentful.sourceLocale?.trim();
      const targetLocales = contentful.targetLocales ?? [];
      const entryId = entryIdOverride?.trim() || resolveContentfulEntryId(session);

      if (!sourceLocale) {
        throw new Error("contentful_source_locale_missing");
      }
      if (!entryId) {
        throw new Error("contentful_entry_id_missing");
      }
      if (targetLocales.length === 0) {
        throw new Error("contentful_target_locales_missing");
      }

      const snapshot = session.run.inputSnapshot;
      const existingRunId =
        typeof session.run.outputSummary.contentfulTranslationRunId === "string"
          ? session.run.outputSummary.contentfulTranslationRunId
          : null;

      const translationRun =
        existingRunId != null
          ? { id: existingRunId }
          : await createContentfulTranslationRun({
              organizationId: session.organizationId,
              connectionId: contentful.connectionId,
              projectId: contentful.projectId,
              workspaceAutomationRunId: session.run.id,
              webhookEventId:
                typeof snapshot.contentfulWebhookEventId === "string"
                  ? snapshot.contentfulWebhookEventId
                  : null,
              entryId,
              contentTypeId:
                typeof snapshot.contentTypeId === "string" ? snapshot.contentTypeId : null,
              sourceLocale,
              targetLocales,
              runQa: contentful.runQa ?? true,
              writeDrafts: contentful.writeDrafts ?? true,
              overwriteDraftLocales: contentful.overwriteDraftLocales ?? false,
            });

      if (!existingRunId) {
        await updateWorkspaceAutomationRun({
          runId: session.run.id,
          organizationId: session.organizationId,
          outputSummary: {
            ...session.run.outputSummary,
            contentfulTranslationRunId: translationRun.id,
          },
        });
      }

      await updateWorkspaceAutomationRun({
        runId: session.run.id,
        organizationId: session.organizationId,
        status: "running",
        startedAt: undefined,
        completedAt: null,
      });

      const result = await runContentfulAgent(
        {
          contentfulTranslationRunId: translationRun.id,
          workspaceAutomationRunId: session.run.id,
          organizationId: session.organizationId,
        },
        { manageWorkspaceRunStatus: false },
      );

      if (!result.ok) {
        session.terminalStatus = "failed";
        session.terminalError = result.error.message;
        await updateWorkspaceAutomationRun({
          runId: session.run.id,
          organizationId: session.organizationId,
          status: "failed",
          error: { message: result.error.message },
          completedAt: new Date(),
        });

        const failure = {
          contentfulTranslationRunId: translationRun.id,
          status: "failed",
          message: result.error.message,
        };
        session.stepResults.run_contentful_translation = failure;
        return failure;
      }

      session.terminalStatus = "succeeded";
      const success = {
        contentfulTranslationRunId: translationRun.id,
        status: "succeeded",
        runId: result.value.runId,
      };
      session.stepResults.run_contentful_translation = success;
      return success;
    },
  });
}
