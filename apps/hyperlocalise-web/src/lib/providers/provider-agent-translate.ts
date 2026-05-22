import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  startAgentRun,
} from "@/lib/providers/agent-runs";
import {
  pullExternalTmsTaskContent,
  type ExternalTmsTaskContent,
  type ExternalTmsTranslationUnit,
} from "@/lib/providers/external-tms-content-sync";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import {
  assembleStringTranslationContextSnapshot,
  loadTranslationContextProject,
} from "@/lib/translation/assemble-translation-context";
import { loadOrganizationOpenAITranslationGenerator } from "@/lib/translation/load-organization-translation-generator";
import type { StringTranslationGenerator } from "@/lib/translation/string-job-executor";

export type ProviderAgentTranslationChangedItem = {
  externalStringId: string;
  key: string;
  locale: string;
  sourceText: string;
  from: string;
  to: string;
};

export type ProviderAgentTranslationResult =
  | {
      ok: true;
      agentRunId: string;
      proposedCount: number;
      unitsProcessed: number;
      skippedApproved: number;
      pullRunId: string;
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
  let unitsProcessed = 0;
  let skippedApproved = 0;

  const project = await loadTranslationContextProject(input.projectId);
  if (!project) {
    return {
      changedItems,
      warnings: [`Translation project ${input.projectId} was not found`],
      unitsProcessed: 0,
      skippedApproved: 0,
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
        skippedApproved += 1;
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
    );
    if (!contextSnapshot.ok) {
      warnings.push(`Skipped ${unit.key}: ${contextSnapshot.message}`);
      continue;
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

        changedItems.push({
          externalStringId: unit.externalStringId,
          key: unit.key,
          locale: translation.locale,
          sourceText: unit.sourceText,
          from,
          to: translation.text,
        });
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
    skippedApproved,
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

  if (run.status !== "queued" && run.status !== "running") {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "agent_run_not_queued",
      message: `Agent run is ${run.status}, expected queued`,
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
    projectId,
    providerKind: run.providerKind,
    content: pullResult.content,
    translateStringJob,
    projectName: organizationGenerator.ok ? organizationGenerator.project.name : "Provider job",
    projectTranslationContext: organizationGenerator.ok
      ? organizationGenerator.project.translationContext
      : "",
  });

  await completeAgentRun({
    runId: run.id,
    organizationId: input.organizationId,
    outputSummary: {
      pullRunId: pullResult.runId,
      unitsDiscovered: pullResult.counts.unitsDiscovered,
      unitsProcessed: translationResult.unitsProcessed,
      proposedCount: translationResult.changedItems.length,
      skippedApproved: translationResult.skippedApproved,
      targetLocales: pullResult.content.targetLocales,
      sourceLocale: pullResult.content.sourceLocale ?? defaultSourceLocale,
    },
    changedItems: translationResult.changedItems,
    warnings: translationResult.warnings,
  });

  return {
    ok: true,
    agentRunId: input.agentRunId,
    proposedCount: translationResult.changedItems.length,
    unitsProcessed: translationResult.unitsProcessed,
    skippedApproved: translationResult.skippedApproved,
    pullRunId: pullResult.runId,
  };
}
