import {
  detectAgentRunProposalWarnings,
  deriveChangedFields,
  buildAgentRunProposalItemId,
  serializeAgentRunProposalItem,
  type AgentRunProposalItem,
} from "@/lib/providers/agent-runs/agent-run-proposals";
import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  startAgentRun,
} from "@/lib/providers/agent-runs/agent-runs";
import {
  pullExternalTmsTaskContent,
  type ExternalTmsTaskContent,
  type ExternalTmsTranslationUnit,
} from "@/lib/providers/sync/external-tms-content-sync";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import {
  assembleStringTranslationContextSnapshot,
  loadTranslationContextProject,
} from "@/lib/translation/assemble-translation-context";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/match-resolution";
import type { AgentRunGlossaryMatchUsage } from "@/lib/providers/contracts/glossary-match";
import type { AgentRunTranslationMemoryMatchUsage } from "@/lib/providers/contracts/translation-memory-match";
import { loadOrganizationOpenAITranslationGenerator } from "@/lib/translation/load-organization-translation-generator";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type { StringTranslationGenerator } from "@/lib/translation/string-job-executor";

export type ProviderAgentTranslationChangedItem = AgentRunProposalItem;

export type ProviderAgentTranslationResult =
  | {
      ok: true;
      agentRunId: string;
      proposedCount: number;
      unitsProcessed: number;
      skippedApprovedLocales: number;
      pullRunId: string;
      alreadyCompleted?: boolean;
    }
  | {
      ok: false;
      agentRunId: string;
      code: string;
      message: string;
    };

const defaultSourceLocale = "en";

function readProjectIdFromInputSnapshot(inputSnapshot: Record<string, unknown>): string | null {
  const projectId = inputSnapshot.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

function readOutputSummaryNumber(outputSummary: Record<string, unknown>, key: string): number {
  const value = outputSummary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readOutputSummaryString(outputSummary: Record<string, unknown>, key: string): string {
  const value = outputSummary[key];
  return typeof value === "string" ? value : "";
}

function existingTranslationForLocale(unit: ExternalTmsTranslationUnit, locale: string) {
  return unit.translations.find((translation) => translation.locale === locale) ?? null;
}

function shouldSkipApprovedTranslation(
  translation: ExternalTmsTranslationUnit["translations"][number] | null,
) {
  return translation?.isApproved === true;
}

function buildJobInputForUnit(input: {
  unit: ExternalTmsTranslationUnit;
  sourceLocale: string;
  targetLocales: string[];
  providerKind: string;
}) {
  return {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    sourceText: input.unit.sourceText,
    context: input.unit.context ?? undefined,
    metadata: {
      externalStringId: input.unit.externalStringId,
      key: input.unit.key,
      fileId: input.unit.fileId ?? "",
      providerKind: input.providerKind,
    },
  };
}

async function translateProviderUnits(input: {
  organizationId: string;
  projectId: string;
  providerKind: string;
  content: ExternalTmsTaskContent;
  translateStringJob: StringTranslationGenerator;
  projectName: string;
  projectTranslationContext: string;
}) {
  const sourceLocale = input.content.sourceLocale ?? defaultSourceLocale;
  const changedItems: ProviderAgentTranslationChangedItem[] = [];
  const warnings: string[] = [];
  const translationMemoryUsageByUnit: Array<{
    externalStringId: string;
    key: string;
    matches: AgentRunTranslationMemoryMatchUsage[];
  }> = [];
  const glossaryUsageByUnit: Array<{
    externalStringId: string;
    key: string;
    matches: AgentRunGlossaryMatchUsage[];
  }> = [];
  let unitsProcessed = 0;
  let skippedApprovedLocales = 0;

  const project = await loadTranslationContextProject(input.projectId);
  if (!project) {
    return {
      projectNotFound: true,
      changedItems,
      warnings: [`Translation project ${input.projectId} was not found`],
      unitsProcessed: 0,
      skippedApprovedLocales: 0,
      translationMemoryUsageByUnit: [],
      glossaryUsageByUnit: [],
    };
  }

  for (const unit of input.content.units) {
    if (!unit.sourceText.trim()) {
      continue;
    }

    unitsProcessed += 1;
    const targetLocales = input.content.targetLocales.filter((locale) => {
      const existing = existingTranslationForLocale(unit, locale);
      if (shouldSkipApprovedTranslation(existing)) {
        skippedApprovedLocales += 1;
        return false;
      }
      return true;
    });

    if (targetLocales.length === 0) {
      continue;
    }

    const jobInput = buildJobInputForUnit({
      unit,
      sourceLocale,
      targetLocales,
      providerKind: input.providerKind,
    });

    const contextSnapshot = await assembleStringTranslationContextSnapshot(
      input.projectId,
      jobInput,
      project,
      {
        organizationId: input.organizationId,
        providerKind: input.providerKind as ExternalTmsProviderKind,
        externalJobUid: input.content.externalTaskId,
        translationMemoryMatchResolution: defaultTranslationMemoryMatchResolution,
        glossaryMatchResolution: defaultGlossaryMatchResolution,
      },
    );
    if (!contextSnapshot.ok) {
      warnings.push(`Skipped ${unit.key}: ${contextSnapshot.message}`);
      continue;
    }

    if (contextSnapshot.snapshot.translationMemoryMatches.length > 0) {
      translationMemoryUsageByUnit.push({
        externalStringId: unit.externalStringId,
        key: unit.key,
        matches: contextSnapshot.snapshot.translationMemoryMatches.map((match) => ({
          memoryId: match.memoryId,
          memoryName: match.memoryName,
          sourceText: match.sourceText,
          targetText: match.targetText,
          targetLocale: match.targetLocale,
          matchScore: match.matchScore,
          matchSource: match.matchSource,
          providerKind: match.providerKind,
          resourceId: match.resourceId,
          externalResourceId: match.externalResourceId,
        })),
      });
    }

    if (contextSnapshot.snapshot.glossaryTerms.length > 0) {
      glossaryUsageByUnit.push({
        externalStringId: unit.externalStringId,
        key: unit.key,
        matches: contextSnapshot.snapshot.glossaryTerms.map((term) => ({
          glossaryId: term.glossaryId,
          glossaryName: term.glossaryName,
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
          targetLocale: term.targetLocale,
          forbidden: term.forbidden ?? false,
          preferred: !(term.forbidden ?? false),
          matchSource: term.matchSource,
          providerKind: term.providerKind,
          resourceId: term.resourceId,
          externalResourceId: term.externalResourceId,
        })),
      });
    }

    try {
      const result = await input.translateStringJob({
        projectName: input.projectName,
        projectTranslationContext: input.projectTranslationContext,
        jobInput,
        contextSnapshot: contextSnapshot.snapshot,
      });

      for (const translation of result.translations) {
        const existing = existingTranslationForLocale(unit, translation.locale);
        const from = existing?.text ?? "";

        if (translation.text === from) {
          continue;
        }

        const proposalWarnings = detectAgentRunProposalWarnings({
          sourceText: unit.sourceText,
          from,
          to: translation.text,
          locale: translation.locale,
          externalStringId: unit.externalStringId,
          key: unit.key,
          glossaryTerms: contextSnapshot.snapshot.glossaryTerms
            .filter((term) => term.targetLocale === translation.locale)
            .map((term) => ({
              sourceTerm: term.sourceTerm,
              targetTerm: term.targetTerm,
              targetLocale: term.targetLocale,
              forbidden: term.forbidden,
              caseSensitive: term.caseSensitive,
            })),
        });

        const localeMatches = contextSnapshot.snapshot.translationMemoryMatches
          .filter((match) => match.targetLocale === translation.locale)
          .map((match) => ({
            memoryId: match.memoryId,
            memoryName: match.memoryName,
            sourceText: match.sourceText,
            targetText: match.targetText,
            targetLocale: match.targetLocale,
            matchScore: match.matchScore,
            matchSource: match.matchSource,
            providerKind: match.providerKind,
            resourceId: match.resourceId,
            externalResourceId: match.externalResourceId,
          }));

        const localeGlossaryMatches = contextSnapshot.snapshot.glossaryTerms
          .filter((term) => term.targetLocale === translation.locale)
          .map((term) => ({
            glossaryId: term.glossaryId,
            glossaryName: term.glossaryName,
            sourceTerm: term.sourceTerm,
            targetTerm: term.targetTerm,
            targetLocale: term.targetLocale,
            forbidden: term.forbidden ?? false,
            preferred: !(term.forbidden ?? false),
            matchSource: term.matchSource,
            providerKind: term.providerKind,
            resourceId: term.resourceId,
            externalResourceId: term.externalResourceId,
          }));

        changedItems.push(
          serializeAgentRunProposalItem({
            itemId: buildAgentRunProposalItemId({
              externalStringId: unit.externalStringId,
              locale: translation.locale,
            }),
            externalStringId: unit.externalStringId,
            key: unit.key,
            locale: translation.locale,
            sourceText: unit.sourceText,
            from,
            to: translation.text,
            reviewState: "pending",
            changedFields: deriveChangedFields(from, translation.text),
            warnings: proposalWarnings,
            translationMemoryMatchesUsed: localeMatches.length > 0 ? localeMatches : undefined,
            glossaryMatchesUsed:
              localeGlossaryMatches.length > 0 ? localeGlossaryMatches : undefined,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "translation failed";
      warnings.push(`Skipped ${unit.key}: ${message}`);
    }
  }

  return {
    changedItems,
    warnings,
    unitsProcessed,
    skippedApprovedLocales,
    translationMemoryUsageByUnit,
    glossaryUsageByUnit,
  };
}

export async function executeProviderAgentTranslation(input: {
  agentRunId: string;
  organizationId: string;
  translateStringJobOverride?: StringTranslationGenerator;
}): Promise<ProviderAgentTranslationResult> {
  const run = await getAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
  });

  if (!run) {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "agent_run_not_found",
      message: "Agent run not found",
    };
  }

  if (run.kind !== "translate") {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_agent_run_kind",
      message: `Agent run kind ${run.kind} is not supported for provider translation`,
    };
  }

  if (run.status === "succeeded") {
    const outputSummary = run.outputSummary ?? {};
    return {
      ok: true,
      agentRunId: input.agentRunId,
      proposedCount: readOutputSummaryNumber(outputSummary, "proposedCount"),
      unitsProcessed: readOutputSummaryNumber(outputSummary, "unitsProcessed"),
      skippedApprovedLocales: readOutputSummaryNumber(outputSummary, "skippedApprovedLocales"),
      pullRunId: readOutputSummaryString(outputSummary, "pullRunId"),
      alreadyCompleted: true,
    };
  }

  if (run.status === "failed" || run.status === "cancelled") {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: run.status === "failed" ? "agent_run_already_failed" : "agent_run_already_cancelled",
      message: `Agent run is ${run.status}, expected queued or running`,
    };
  }

  const projectId = readProjectIdFromInputSnapshot(run.inputSnapshot);
  if (!projectId) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "missing_project_id" },
      warnings: ["Agent run input snapshot is missing projectId"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "missing_project_id",
      message: "Agent run input snapshot is missing projectId",
    };
  }

  const pullContent = getProviderContentPuller(run.providerKind);
  if (!pullContent) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: "unsupported_provider_pull",
        providerKind: run.providerKind,
      },
      warnings: [`Provider ${run.providerKind} does not support content pull yet`],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_provider_pull",
      message: `Provider ${run.providerKind} does not support content pull yet`,
    };
  }

  if (run.status === "queued") {
    try {
      await startAgentRun({
        runId: run.id,
        organizationId: input.organizationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start agent run";
      await failAgentRun({
        runId: run.id,
        organizationId: input.organizationId,
        outputSummary: { code: "agent_run_start_failed" },
        warnings: [message],
      });
      return {
        ok: false,
        agentRunId: input.agentRunId,
        code: "agent_run_start_failed",
        message,
      };
    }
  }

  let pullResult;
  try {
    pullResult = await pullExternalTmsTaskContent({
      organizationId: input.organizationId,
      projectId,
      providerKind: run.providerKind,
      externalJobId: run.externalJobId,
      pullContent,
      actorUserId: run.actorUserId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider content pull failed";
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: { code: "provider_content_pull_failed" },
      warnings: [message],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "provider_content_pull_failed",
      message,
    };
  }

  const organizationGenerator = await loadOrganizationOpenAITranslationGenerator(projectId);

  if (!organizationGenerator.ok && !input.translateStringJobOverride) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: organizationGenerator.code,
        pullRunId: pullResult.runId,
        unitsDiscovered: pullResult.counts.unitsDiscovered,
      },
      warnings: [organizationGenerator.message],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: organizationGenerator.code,
      message: organizationGenerator.message,
    };
  }

  const translateStringJob =
    input.translateStringJobOverride ??
    (organizationGenerator.ok ? organizationGenerator.translateStringJob : null);

  if (!translateStringJob) {
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: "provider_credential_missing",
        pullRunId: pullResult.runId,
      },
      warnings: ["No translation generator available for this organization"],
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "provider_credential_missing",
      message: "No translation generator available for this organization",
    };
  }

  const translationResult = await translateProviderUnits({
    organizationId: input.organizationId,
    projectId,
    providerKind: run.providerKind,
    content: pullResult.content,
    translateStringJob,
    projectName: organizationGenerator.ok ? organizationGenerator.project.name : "Provider job",
    projectTranslationContext: organizationGenerator.ok
      ? organizationGenerator.project.translationContext
      : "",
  });

  if (translationResult.projectNotFound) {
    const message =
      translationResult.warnings[0] ?? `Translation project ${projectId} was not found`;
    await failAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        code: "translation_project_not_found",
        pullRunId: pullResult.runId,
        unitsDiscovered: pullResult.counts.unitsDiscovered,
      },
      warnings: translationResult.warnings,
    });

    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "translation_project_not_found",
      message,
    };
  }

  await completeAgentRun({
    runId: run.id,
    organizationId: input.organizationId,
    outputSummary: {
      pullRunId: pullResult.runId,
      unitsDiscovered: pullResult.counts.unitsDiscovered,
      unitsProcessed: translationResult.unitsProcessed,
      proposedCount: translationResult.changedItems.length,
      skippedApprovedLocales: translationResult.skippedApprovedLocales,
      targetLocales: pullResult.content.targetLocales,
      sourceLocale: pullResult.content.sourceLocale ?? defaultSourceLocale,
      translationMemoryUsage: translationResult.translationMemoryUsageByUnit,
      glossaryUsage: translationResult.glossaryUsageByUnit,
    },
    changedItems: translationResult.changedItems,
    warnings: translationResult.warnings,
  });

  return {
    ok: true,
    agentRunId: input.agentRunId,
    proposedCount: translationResult.changedItems.length,
    unitsProcessed: translationResult.unitsProcessed,
    skippedApprovedLocales: translationResult.skippedApprovedLocales,
    pullRunId: pullResult.runId,
  };
}
