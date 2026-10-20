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

export function readCreateNativeTmsJob(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.create_native_tms_job;
  if (fromCurrentStep && readString(fromCurrentStep.jobId)) {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.createNativeTmsJob;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (readString(record.jobId)) {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "create_native_tms_job",
  );
  if (fromPriorStep && readString(fromPriorStep.jobId)) {
    return fromPriorStep;
  }

  return null;
}

export function readImportSanityDocuments(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.import_sanity_documents;
  if (fromCurrentStep && typeof fromCurrentStep.imported === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.importSanityDocuments;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.imported === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "import_sanity_documents",
  );
  if (fromPriorStep && typeof fromPriorStep.imported === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readImportIntercomArticles(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.import_intercom_articles;
  if (fromCurrentStep && typeof fromCurrentStep.imported === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.importIntercomArticles;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.imported === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "import_intercom_articles",
  );
  if (fromPriorStep && typeof fromPriorStep.imported === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readImportBrazeTemplates(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.import_braze_templates;
  if (fromCurrentStep && typeof fromCurrentStep.imported === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.importBrazeTemplates;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.imported === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "import_braze_templates",
  );
  if (fromPriorStep && typeof fromPriorStep.imported === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readImportBrazeCampaigns(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.import_braze_campaigns;
  if (fromCurrentStep && typeof fromCurrentStep.imported === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.importBrazeCampaigns;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.imported === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "import_braze_campaigns",
  );
  if (fromPriorStep && typeof fromPriorStep.imported === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readPushBrazeCampaigns(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.push_braze_campaigns;
  if (fromCurrentStep && typeof fromCurrentStep.pushedLocales === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.pushBrazeCampaigns;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.pushedLocales === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "push_braze_campaigns",
  );
  if (fromPriorStep && typeof fromPriorStep.pushedLocales === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readPushBrazeTemplates(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.push_braze_templates;
  if (fromCurrentStep && typeof fromCurrentStep.pushedLocales === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.pushBrazeTemplates;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.pushedLocales === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "push_braze_templates",
  );
  if (fromPriorStep && typeof fromPriorStep.pushedLocales === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readPushSanityTranslations(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.push_sanity_translations;
  if (fromCurrentStep && typeof fromCurrentStep.pushedLocales === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.pushSanityTranslations;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.pushedLocales === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "push_sanity_translations",
  );
  if (fromPriorStep && typeof fromPriorStep.pushedLocales === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readPushIntercomTranslations(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.push_intercom_translations;
  if (fromCurrentStep && typeof fromCurrentStep.pushedLocales === "number") {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.pushIntercomTranslations;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (typeof record.pushedLocales === "number") {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "push_intercom_translations",
  );
  if (fromPriorStep && typeof fromPriorStep.pushedLocales === "number") {
    return fromPriorStep;
  }

  return null;
}

export function readAssignTranslateWithAgent(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.assign_translate_with_agent;
  if (fromCurrentStep && readString(fromCurrentStep.jobId) && fromCurrentStep.enqueued === true) {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.assignTranslateWithAgent;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (readString(record.jobId) && record.enqueued === true) {
      return record;
    }
  }

  const fromPriorStep = readStepResult(
    outputSummary.orchestratorStepResults,
    "assign_translate_with_agent",
  );
  if (fromPriorStep && readString(fromPriorStep.jobId) && fromPriorStep.enqueued === true) {
    return fromPriorStep;
  }

  return null;
}

function isCreateIssueOutput(value: Record<string, unknown>): boolean {
  return Array.isArray(value.issues) && typeof value.createdCount === "number";
}

export function readCreateIssue(
  outputSummary: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
): Record<string, unknown> | null {
  const fromCurrentStep = stepResults.create_issue;
  if (fromCurrentStep && isCreateIssueOutput(fromCurrentStep)) {
    return fromCurrentStep;
  }

  const fromOutput = outputSummary.createIssue;
  if (fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)) {
    const record = fromOutput as Record<string, unknown>;
    if (isCreateIssueOutput(record)) {
      return record;
    }
  }

  const fromPriorStep = readStepResult(outputSummary.orchestratorStepResults, "create_issue");
  if (fromPriorStep && isCreateIssueOutput(fromPriorStep)) {
    return fromPriorStep;
  }

  return null;
}

export function buildWorkspaceOrchestratorOutputSummary(
  base: Record<string, unknown>,
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>,
  options?: {
    notificationWarnings?: Array<{
      channel: "slack" | "email" | "github_comment";
      code: string;
      message: string;
    }>;
  },
): Record<string, unknown> {
  const contentfulTranslationRunId = readContentfulTranslationRunId(base, stepResults);
  const createNativeTmsJob = readCreateNativeTmsJob(base, stepResults);
  const assignTranslateWithAgent = readAssignTranslateWithAgent(base, stepResults);
  const createIssue = readCreateIssue(base, stepResults);
  const importIntercomArticles = readImportIntercomArticles(base, stepResults);
  const pushIntercomTranslations = readPushIntercomTranslations(base, stepResults);
  const importSanityDocuments = readImportSanityDocuments(base, stepResults);
  const pushSanityTranslations = readPushSanityTranslations(base, stepResults);
  const importBrazeTemplates = readImportBrazeTemplates(base, stepResults);
  const pushBrazeTemplates = readPushBrazeTemplates(base, stepResults);
  const importBrazeCampaigns = readImportBrazeCampaigns(base, stepResults);
  const pushBrazeCampaigns = readPushBrazeCampaigns(base, stepResults);

  return {
    ...base,
    ...(contentfulTranslationRunId ? { contentfulTranslationRunId } : {}),
    ...(createNativeTmsJob ? { createNativeTmsJob } : {}),
    ...(assignTranslateWithAgent ? { assignTranslateWithAgent } : {}),
    ...(createIssue ? { createIssue } : {}),
    ...(importIntercomArticles ? { importIntercomArticles } : {}),
    ...(pushIntercomTranslations ? { pushIntercomTranslations } : {}),
    ...(importSanityDocuments ? { importSanityDocuments } : {}),
    ...(pushSanityTranslations ? { pushSanityTranslations } : {}),
    ...(importBrazeTemplates ? { importBrazeTemplates } : {}),
    ...(pushBrazeTemplates ? { pushBrazeTemplates } : {}),
    ...(importBrazeCampaigns ? { importBrazeCampaigns } : {}),
    ...(pushBrazeCampaigns ? { pushBrazeCampaigns } : {}),
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
