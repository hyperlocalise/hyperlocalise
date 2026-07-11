import { createLogger } from "@/lib/log";
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
import { pullExternalTmsTaskContent } from "@/lib/providers/shared/tms-provider-content";
import type {
  ExternalTmsTaskContent,
  ExternalTmsTranslationUnit,
} from "@/lib/providers/jobs/tms-provider-types";
import { getProviderContentPuller } from "@/lib/providers/adapters/tms-provider-registry";
import {
  resolveProviderAgentRunSourceFiles,
  readProviderAgentRunSourceFilesFromSnapshot,
} from "@/lib/providers/jobs/job-provider-source-files";
import {
  shouldUseProviderFileTranslation,
  summarizeProviderUnitFileIds,
  translateProviderJobFiles,
} from "@/lib/providers/agent-runs/provider-agent-file-translate";
import {
  assembleStringTranslationContextSnapshot,
  loadTranslationContextProject,
} from "@/lib/translation/context";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/capabilities/match-resolution";
import type { AgentRunGlossaryMatchUsage } from "@/lib/providers/contracts/glossary-match";
import type { AgentRunTranslationMemoryMatchUsage } from "@/lib/providers/contracts/translation-memory-match";
import { loadOrganizationTranslationGenerator } from "@/lib/translation/generation";
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import type { StringTranslationGenerator } from "@/lib/translation/domain";

const logger = createLogger("provider-agent-translate");

export type ProviderAgentTranslationChangedItem = AgentRunProposalItem;

export type ProviderAgentTranslationResult =
  | {
      ok: true;
      agentRunId: string;
      proposedCount: number;
      unitsProcessed: number;
      skippedExistingLocales: number;
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

function readAutomationLocales(inputSnapshot: Record<string, unknown>): string[] | null {
  const automationLocales = inputSnapshot.automationLocales;
  if (!Array.isArray(automationLocales)) {
    return null;
  }

  return automationLocales.filter(
    (locale): locale is string => typeof locale === "string" && locale.trim().length > 0,
  );
}

function buildPullDiagnosticsSummary(providerPayload: Record<string, unknown> | undefined) {
  const summary: Record<string, unknown> = {};
  if (typeof providerPayload?.stringPullStrategy === "string") {
    summary.stringPullStrategy = providerPayload.stringPullStrategy;
  }

  const countsByFileId = providerPayload?.stringPullCountsByFileId;
  if (countsByFileId && typeof countsByFileId === "object" && !Array.isArray(countsByFileId)) {
    summary.stringPullCountsByFileId = countsByFileId;
  }

  return summary;
}

function readProjectIdFromInputSnapshot(inputSnapshot: Record<string, unknown>): string | null {
  const projectId = inputSnapshot.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

function readOutputSummaryNumber(outputSummary: Record<string, unknown>, key: string): number {
  const value = outputSummary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readSkippedExistingLocalesCount(outputSummary: Record<string, unknown>): number {
  if ("skippedExistingLocales" in outputSummary) {
    return readOutputSummaryNumber(outputSummary, "skippedExistingLocales");
  }

  return readOutputSummaryNumber(outputSummary, "skippedApprovedLocales");
}

function readOutputSummaryString(outputSummary: Record<string, unknown>, key: string): string {
  const value = outputSummary[key];
  return typeof value === "string" ? value : "";
}

function existingTranslationForLocale(unit: ExternalTmsTranslationUnit, locale: string) {
  return unit.translations.find((translation) => translation.locale === locale) ?? null;
}

function shouldSkipExistingTranslation(
  translation: ExternalTmsTranslationUnit["translations"][number] | null,
) {
  return Boolean(translation?.text?.trim());
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
  knowledgeMemoryEnabled: boolean;
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
  let skippedExistingLocales = 0;

  const project = await loadTranslationContextProject(input.projectId);
  if (!project) {
    return {
      projectNotFound: true,
      changedItems,
      warnings: [`Translation project ${input.projectId} was not found`],
      unitsProcessed: 0,
      skippedExistingLocales: 0,
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
      if (shouldSkipExistingTranslation(existing)) {
        skippedExistingLocales += 1;
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
        knowledgeMemoryEnabled: input.knowledgeMemoryEnabled,
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
    skippedExistingLocales,
    translationMemoryUsageByUnit,
    glossaryUsageByUnit,
  };
}

export async function executeProviderAgentTranslation(input: {
  agentRunId: string;
  organizationId: string;
  knowledgeMemoryEnabled?: boolean;
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
      skippedExistingLocales: readSkippedExistingLocalesCount(outputSummary),
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

  const automationLocales = readAutomationLocales(run.inputSnapshot);
  const filteredContent =
    automationLocales && automationLocales.length > 0
      ? {
          ...pullResult.content,
          targetLocales: pullResult.content.targetLocales.filter((locale) =>
            automationLocales.includes(locale),
          ),
        }
      : pullResult.content;

  const providerPayload = pullResult.content.providerPayload ?? {};
  const stringPullStrategy =
    typeof providerPayload.stringPullStrategy === "string"
      ? providerPayload.stringPullStrategy
      : null;
  const sourceFileCount = readProviderAgentRunSourceFilesFromSnapshot(
    run.inputSnapshot ?? {},
  ).length;
  const pullDiagnosticsSummary = buildPullDiagnosticsSummary(providerPayload);

  logger.info(
    {
      agentRunId: input.agentRunId,
      organizationId: input.organizationId,
      providerKind: run.providerKind,
      externalJobId: run.externalJobId,
      unitsDiscovered: pullResult.counts.unitsDiscovered,
      targetLocaleCount: filteredContent.targetLocales.length,
      automationLocaleCount: automationLocales?.length ?? 0,
      stringPullStrategy,
      sourceFileCount,
    },
    "provider agent translation content pull completed",
  );

  if (pullResult.counts.unitsDiscovered === 0) {
    logger.warn(
      {
        agentRunId: input.agentRunId,
        organizationId: input.organizationId,
        providerKind: run.providerKind,
        externalJobId: run.externalJobId,
        stringPullStrategy,
        taskFileIdCount: Array.isArray(providerPayload.fileIds)
          ? providerPayload.fileIds.length
          : 0,
        taskStringIdCount: Array.isArray(providerPayload.stringIds)
          ? providerPayload.stringIds.length
          : 0,
        sourceFileCount,
      },
      "provider agent translation found no strings after content pull",
    );
  }

  const [jobDetails] = run.hyperlocaliseJobId
    ? await (async () => {
        const { db, schema } = await import("@/lib/database");
        const { eq } = await import("drizzle-orm");
        return db
          .select({
            providerPayload: schema.externalJobDetails.providerPayload,
          })
          .from(schema.externalJobDetails)
          .where(eq(schema.externalJobDetails.jobId, run.hyperlocaliseJobId!))
          .limit(1);
      })()
    : [null];

  const sourceFiles = await resolveProviderAgentRunSourceFiles({
    organizationId: input.organizationId,
    projectId,
    providerKind: run.providerKind,
    inputSnapshot: run.inputSnapshot ?? {},
    syncedProviderPayload: jobDetails?.providerPayload ?? null,
  });

  if (shouldUseProviderFileTranslation({ sourceFiles })) {
    const unitFileIdCounts = summarizeProviderUnitFileIds(filteredContent.units);

    logger.info(
      {
        agentRunId: input.agentRunId,
        organizationId: input.organizationId,
        translationMode: "file",
        unitsDiscovered: pullResult.counts.unitsDiscovered,
        sourceFileCount: sourceFiles.length,
        sourceFilesWithPathCount: sourceFiles.filter((file) => Boolean(file.sourcePath?.trim()))
          .length,
        sourceFileIds: sourceFiles.map((file) => ({
          id: file.id,
          hasSourcePath: Boolean(file.sourcePath?.trim()),
        })),
        unitFileIdCounts,
        targetLocaleCount: filteredContent.targetLocales.length,
        stringPullStrategy,
      },
      "provider agent translation selected file mode",
    );

    const fileTranslationResult = await translateProviderJobFiles({
      agentRunId: input.agentRunId,
      organizationId: input.organizationId,
      projectId,
      providerKind: run.providerKind,
      content: filteredContent,
      sourceFiles,
      actorUserId: run.actorUserId,
    });

    await completeAgentRun({
      runId: run.id,
      organizationId: input.organizationId,
      outputSummary: {
        pullRunId: pullResult.runId,
        unitsDiscovered: pullResult.counts.unitsDiscovered,
        unitsProcessed: fileTranslationResult.unitsProcessed,
        proposedCount: fileTranslationResult.changedItems.length,
        skippedExistingLocales: fileTranslationResult.skippedExistingLocales,
        filesProcessed: fileTranslationResult.filesProcessed,
        translationMode: "file",
        targetLocales: filteredContent.targetLocales,
        sourceLocale: filteredContent.sourceLocale ?? defaultSourceLocale,
        ...pullDiagnosticsSummary,
      },
      changedItems: fileTranslationResult.changedItems,
      warnings: fileTranslationResult.warnings,
    });

    logger.info(
      {
        agentRunId: input.agentRunId,
        organizationId: input.organizationId,
        translationMode: "file",
        unitsDiscovered: pullResult.counts.unitsDiscovered,
        unitsProcessed: fileTranslationResult.unitsProcessed,
        proposedCount: fileTranslationResult.changedItems.length,
        filesProcessed: fileTranslationResult.filesProcessed,
        sourceFileCount: sourceFiles.length,
        warningCount: fileTranslationResult.warnings.length,
        unitFileIdCounts,
        stringPullStrategy,
        ...(pullResult.counts.unitsDiscovered > 0 &&
        fileTranslationResult.filesProcessed === 0 &&
        fileTranslationResult.unitsProcessed === 0 &&
        fileTranslationResult.changedItems.length === 0
          ? { emptyTranslationResult: true }
          : {}),
      },
      "provider agent file translation completed",
    );

    if (
      pullResult.counts.unitsDiscovered > 0 &&
      fileTranslationResult.filesProcessed === 0 &&
      fileTranslationResult.unitsProcessed === 0 &&
      fileTranslationResult.changedItems.length === 0
    ) {
      logger.warn(
        {
          agentRunId: input.agentRunId,
          organizationId: input.organizationId,
          translationMode: "file",
          unitsDiscovered: pullResult.counts.unitsDiscovered,
          sourceFileCount: sourceFiles.length,
          sourceFileIds: sourceFiles.map((file) => ({
            id: file.id,
            hasSourcePath: Boolean(file.sourcePath?.trim()),
          })),
          unitFileIdCounts,
          warningCount: fileTranslationResult.warnings.length,
          reason: "file_mode_produced_no_translations",
        },
        "provider agent translation discovered units but file mode produced no translations",
      );
    }

    return {
      ok: true,
      agentRunId: input.agentRunId,
      proposedCount: fileTranslationResult.changedItems.length,
      unitsProcessed: fileTranslationResult.unitsProcessed,
      skippedExistingLocales: fileTranslationResult.skippedExistingLocales,
      pullRunId: pullResult.runId,
    };
  }

  const organizationGenerator = await loadOrganizationTranslationGenerator(projectId);

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

  logger.info(
    {
      agentRunId: input.agentRunId,
      organizationId: input.organizationId,
      translationMode: "string",
      unitsDiscovered: pullResult.counts.unitsDiscovered,
      stringPullStrategy,
    },
    "provider agent translation selected string mode",
  );

  const translationResult = await translateProviderUnits({
    organizationId: input.organizationId,
    projectId,
    providerKind: run.providerKind,
    content: filteredContent,
    translateStringJob,
    projectName: organizationGenerator.ok ? organizationGenerator.project.name : "Provider job",
    projectTranslationContext: organizationGenerator.ok
      ? organizationGenerator.project.translationContext
      : "",
    knowledgeMemoryEnabled: input.knowledgeMemoryEnabled ?? false,
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
      skippedExistingLocales: translationResult.skippedExistingLocales,
      targetLocales: filteredContent.targetLocales,
      sourceLocale: filteredContent.sourceLocale ?? defaultSourceLocale,
      translationMemoryUsage: translationResult.translationMemoryUsageByUnit,
      glossaryUsage: translationResult.glossaryUsageByUnit,
      ...pullDiagnosticsSummary,
    },
    changedItems: translationResult.changedItems,
    warnings: translationResult.warnings,
  });

  logger.info(
    {
      agentRunId: input.agentRunId,
      organizationId: input.organizationId,
      translationMode: "string",
      unitsDiscovered: pullResult.counts.unitsDiscovered,
      unitsProcessed: translationResult.unitsProcessed,
      proposedCount: translationResult.changedItems.length,
      stringPullStrategy,
    },
    "provider agent string translation completed",
  );

  return {
    ok: true,
    agentRunId: input.agentRunId,
    proposedCount: translationResult.changedItems.length,
    unitsProcessed: translationResult.unitsProcessed,
    skippedExistingLocales: translationResult.skippedExistingLocales,
    pullRunId: pullResult.runId,
  };
}
