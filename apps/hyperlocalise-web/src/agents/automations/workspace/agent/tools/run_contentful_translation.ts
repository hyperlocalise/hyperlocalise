import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { runContentfulAgent } from "@/agents/automations/contentful/agent/run-contentful-agent";
import { createContentfulTranslationRun } from "@/lib/contentful/automation-executor";
import { hasContentfulNoWriteback } from "@/lib/contentful/types";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";

export function resolveContentfulEntryId(session: WorkspaceOrchestratorSession) {
  const snapshot = session.run.inputSnapshot;
  if (typeof snapshot.entryId === "string" && snapshot.entryId.trim()) {
    return snapshot.entryId.trim();
  }

  return session.automation.toolConfig.contentful?.entryId?.trim() ?? null;
}

export function resolveContentfulEntryIdForExecution(
  session: WorkspaceOrchestratorSession,
  entryIdOverride?: string,
) {
  const resolvedEntryId = resolveContentfulEntryId(session);
  if (resolvedEntryId) {
    return resolvedEntryId;
  }

  return entryIdOverride?.trim() ?? null;
}

const runContentfulTranslationInputSchema = z.object({
  entryId: z
    .string()
    .trim()
    .min(1)
    .describe("Contentful entry ID to translate when none was provided by the trigger."),
});

export function createRunContentfulTranslationTool(session: WorkspaceOrchestratorSession) {
  const presetEntryId = resolveContentfulEntryId(session);

  return defineAgentTool({
    description: presetEntryId
      ? `Translate Contentful entry ${presetEntryId} into target locales, run QA when enabled, and write drafts.`
      : "Translate the configured Contentful entry into target locales, run QA when enabled, and write drafts.",
    inputSchema: presetEntryId ? z.object({}) : runContentfulTranslationInputSchema,
    execute: async (input) => {
      const entryIdOverride =
        "entryId" in input && typeof input.entryId === "string" ? input.entryId : undefined;
      const contentful = session.automation.toolConfig.contentful;
      if (!contentful?.enabled || !contentful.connectionId || !contentful.projectId) {
        throw new Error("contentful_workflow_not_configured");
      }

      const sourceLocale = contentful.sourceLocale?.trim();
      const targetLocales = contentful.targetLocales ?? [];
      const entryId = resolveContentfulEntryIdForExecution(session, entryIdOverride);

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

      const noWriteback = hasContentfulNoWriteback({
        writeDrafts: contentful.writeDrafts ?? true,
        fieldsDetected: result.value.fieldsDetected,
        localeValuesWritten: result.value.localeValuesWritten,
      });

      if (noWriteback) {
        const message = "contentful_no_draft_writebacks";
        session.terminalStatus = "failed";
        session.terminalError = message;
        await updateWorkspaceAutomationRun({
          runId: session.run.id,
          organizationId: session.organizationId,
          status: "failed",
          error: { message },
          completedAt: new Date(),
        });

        const failure = {
          contentfulTranslationRunId: translationRun.id,
          status: "failed",
          message,
          fieldsDetected: result.value.fieldsDetected,
          localeValuesWritten: result.value.localeValuesWritten,
        };
        session.stepResults.run_contentful_translation = failure;
        return failure;
      }

      session.terminalStatus = "succeeded";
      const success = {
        contentfulTranslationRunId: translationRun.id,
        status: "succeeded",
        runId: result.value.runId,
        fieldsDetected: result.value.fieldsDetected,
        localeValuesWritten: result.value.localeValuesWritten,
        qaFindingCount: result.value.qaFindingCount,
      };
      session.stepResults.run_contentful_translation = success;
      return success;
    },
  });
}
