import type { WorkspaceOrchestratorSession } from "./context";
import type { WorkspaceOrchestratorToolName } from "./plan";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStepResult(
  orchestratorStepResults: unknown,
  toolName: WorkspaceOrchestratorToolName,
): Record<string, unknown> | undefined {
  if (
    !orchestratorStepResults ||
    typeof orchestratorStepResults !== "object" ||
    Array.isArray(orchestratorStepResults)
  ) {
    return undefined;
  }

  const stepResult = (orchestratorStepResults as Record<string, unknown>)[toolName];
  if (!stepResult || typeof stepResult !== "object" || Array.isArray(stepResult)) {
    return undefined;
  }

  return stepResult as Record<string, unknown>;
}

function readContentfulTranslationRunId(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): string | null {
  return (
    readString(stepResults.run_contentful_translation?.contentfulTranslationRunId) ??
    readString(outputSummary.contentfulTranslationRunId) ??
    readString(
      readStepResult(outputSummary.orchestratorStepResults, "run_contentful_translation")
        ?.contentfulTranslationRunId,
    )
  );
}

function readCreateTranslationJobs(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.create_translation_jobs;
  if (fromCurrentStep && readString(fromCurrentStep.jobId)) {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.createTranslationJobs;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (readString(record.jobId)) {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "create_translation_jobs",
  );
  if (fromPriorStep && readString(fromPriorStep.jobId)) {
    return fromPriorStep;
  }

  return null;
}

export function buildWorkspaceOrchestratorOutputSummary(
  base: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
  options?: {
    notificationWarnings?: Array<{ channel: "slack" | "email"; code: string; message: string }>;
  },
): Record<string, unknown> {
  const contentfulTranslationRunId = readContentfulTranslationRunId(base, stepResults);
  const createTranslationJobs = readCreateTranslationJobs(base, stepResults);

  return {
    ...base,
    ...(contentfulTranslationRunId ? { contentfulTranslationRunId } : {}),
    ...(createTranslationJobs ? { createTranslationJobs } : {}),
    orchestratorStepResults: stepResults,
    ...(options?.notificationWarnings && options.notificationWarnings.length > 0
      ? { notificationWarnings: options.notificationWarnings }
      : {}),
  };
}

export function mergeToolOutputSummaryIntoSessionRun(
  session: WorkspaceOrchestratorSession,
  patch: Record<string, unknown>,
) {
  session.run = {
    ...session.run,
    outputSummary: {
      ...session.run.outputSummary,
      ...patch,
    },
  };
}
