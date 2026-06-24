import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { WorkspaceOrchestratorSession } from "../context";

function readContentfulTranslationRunId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readContentfulTranslationRunIdFromStepResult(
  stepResult: Record<string, unknown> | undefined,
): string | null {
  return readContentfulTranslationRunId(stepResult?.contentfulTranslationRunId);
}

export async function resolveExistingContentfulTranslationRunId(
  session: WorkspaceOrchestratorSession,
): Promise<string | null> {
  const fromOutput = readContentfulTranslationRunId(
    session.run.outputSummary.contentfulTranslationRunId,
  );
  if (fromOutput) {
    return fromOutput;
  }

  const fromCurrentStep = readContentfulTranslationRunIdFromStepResult(
    session.stepResults.run_contentful_translation,
  );
  if (fromCurrentStep) {
    return fromCurrentStep;
  }

  const priorStepResults = session.run.outputSummary.orchestratorStepResults;
  if (
    priorStepResults &&
    typeof priorStepResults === "object" &&
    !Array.isArray(priorStepResults)
  ) {
    const fromPriorStep = readContentfulTranslationRunIdFromStepResult(
      (priorStepResults as Record<string, unknown>).run_contentful_translation as
        | Record<string, unknown>
        | undefined,
    );
    if (fromPriorStep) {
      return fromPriorStep;
    }
  }

  const [existingRun] = await db
    .select({ id: schema.contentfulTranslationRuns.id })
    .from(schema.contentfulTranslationRuns)
    .where(
      and(
        eq(schema.contentfulTranslationRuns.workspaceAutomationRunId, session.run.id),
        eq(schema.contentfulTranslationRuns.organizationId, session.organizationId),
      ),
    )
    .orderBy(desc(schema.contentfulTranslationRuns.createdAt))
    .limit(1);

  return existingRun?.id ?? null;
}

export async function loadCompletedContentfulTranslationRunSummary(
  runId: string,
  organizationId: string,
) {
  const [run] = await db
    .select({
      id: schema.contentfulTranslationRuns.id,
      status: schema.contentfulTranslationRuns.status,
      detectedFields: schema.contentfulTranslationRuns.detectedFields,
      writebackSummary: schema.contentfulTranslationRuns.writebackSummary,
      qaSummary: schema.contentfulTranslationRuns.qaSummary,
    })
    .from(schema.contentfulTranslationRuns)
    .where(
      and(
        eq(schema.contentfulTranslationRuns.id, runId),
        eq(schema.contentfulTranslationRuns.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    return null;
  }

  if (run.status !== "succeeded" && run.status !== "succeeded_with_warnings") {
    return null;
  }

  const writebackSummary =
    run.writebackSummary && typeof run.writebackSummary === "object"
      ? (run.writebackSummary as Record<string, unknown>)
      : {};
  const localeValuesWritten =
    typeof writebackSummary.localeValuesWritten === "number"
      ? writebackSummary.localeValuesWritten
      : 0;
  const qaSummary =
    run.qaSummary && typeof run.qaSummary === "object"
      ? (run.qaSummary as Record<string, unknown>)
      : {};
  const qaFindingCount = typeof qaSummary.total === "number" ? qaSummary.total : 0;

  return {
    contentfulTranslationRunId: run.id,
    status: "succeeded" as const,
    runId: run.id,
    fieldsDetected: Array.isArray(run.detectedFields) ? run.detectedFields.length : 0,
    localeValuesWritten,
    qaFindingCount,
  };
}
