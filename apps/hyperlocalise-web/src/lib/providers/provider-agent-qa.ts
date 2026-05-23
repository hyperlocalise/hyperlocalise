import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  listAgentRuns,
  startAgentRun,
} from "@/lib/providers/agent-runs";
import {
  pullExternalTmsTaskContent,
  type ExternalTmsContentSyncFailure,
  type ExternalTmsTaskContent,
} from "@/lib/providers/external-tms-content-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { collectGlossaryUsageForUnits } from "@/lib/translation/load-glossary-matches";
import { collectTranslationMemoryUsageForUnits } from "@/lib/translation/load-translation-memory-matches";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import { loadProjectGlossaryTerms } from "@/lib/providers/provider-job-qa/load-glossary-terms";
import {
  buildProviderJobQaReport,
  runProviderJobQa,
} from "@/lib/providers/provider-job-qa/run-provider-job-qa";
import {
  runHlCheckOnProviderContent,
  type RunHlCheckResult,
} from "@/lib/providers/provider-job-qa/run-hl-check";
import type { ProviderQaReport } from "@/lib/providers/provider-job-qa/types";
import {
  buildProviderReviewReport,
  mergeProviderReviewReports,
} from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";
import { providerReviewReportSchema } from "@/api/routes/project/job-qa.schema";
import { pullProviderReviewForJob } from "@/lib/providers/sync-provider-review";

export type ProviderAgentQaResult =
  | {
      ok: true;
      agentRunId: string;
      pullRunId: string;
      report: ProviderQaReport;
      alreadyCompleted?: boolean;
    }
  | {
      ok: false;
      agentRunId: string;
      code: string;
      message: string;
    };

function readProjectIdFromInputSnapshot(inputSnapshot: Record<string, unknown>): string | null {
  const projectId = inputSnapshot.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

function readOutputSummaryString(outputSummary: Record<string, unknown>, key: string): string {
  const value = outputSummary[key];
  return typeof value === "string" ? value : "";
}

function readInputSnapshotAction(inputSnapshot: Record<string, unknown>): string | null {
  const action = inputSnapshot.action;
  return typeof action === "string" ? action : null;
}

function readStoredReviewReport(
  outputSummary: Record<string, unknown>,
): ProviderReviewReport | null {
  const parsed = providerReviewReportSchema.safeParse({
    threads: outputSummary.reviewThreads,
    summary: outputSummary.reviewSummary,
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

async function loadPreviousProviderReviewReport(input: {
  organizationId: string;
  hyperlocaliseJobId: string | null;
  currentRunId: string;
}): Promise<ProviderReviewReport | null> {
  if (!input.hyperlocaliseJobId) {
    return null;
  }

  const priorRuns = await listAgentRuns({
    organizationId: input.organizationId,
    hyperlocaliseJobId: input.hyperlocaliseJobId,
    kind: "review",
    status: "succeeded",
    limit: 25,
  });

  for (const run of priorRuns) {
    if (run.id === input.currentRunId) {
      continue;
    }

    if (readInputSnapshotAction(run.inputSnapshot ?? {}) !== "review_with_agent") {
      continue;
    }

    const report = readStoredReviewReport(run.outputSummary ?? {});
    if (report) {
      return report;
    }
  }

  return null;
}

function readStoredReport(outputSummary: Record<string, unknown>): ProviderQaReport | null {
  const findings = outputSummary.findings;
  const summary = outputSummary.summary;
  if (!Array.isArray(findings) || typeof summary !== "object" || summary === null) {
    return null;
  }

  return {
    findings: findings as ProviderQaReport["findings"],
    summary: summary as ProviderQaReport["summary"],
  };
}

export async function runProviderJobQaForJob(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
}) {
  const pullContent = getProviderContentPuller(input.providerKind);
  if (!pullContent) {
    throw new Error(`Provider ${input.providerKind} does not support content pull yet`);
  }

  const pullResult = await pullExternalTmsTaskContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
    externalJobId: input.externalJobId,
    pullContent,
  });

  const qaResult = await executeProviderJobQaForContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
    externalJobId: input.externalJobId,
    content: pullResult.content,
    pullRunId: pullResult.runId,
  });

  return {
    pullRunId: qaResult.pullRunId,
    report: qaResult.report,
    unitsDiscovered: pullResult.counts.unitsDiscovered,
  };
}

export async function executeProviderJobQaForContent(input: {
  organizationId: string;
  projectId: string;
  providerKind: string;
  externalJobId: string;
  content: ExternalTmsTaskContent;
  pullRunId: string;
}) {
  const glossaryTerms = await loadProjectGlossaryTerms(input.projectId);
  const report = await runProviderJobQa(input.content, {
    targetLocales: input.content.targetLocales,
    sourceLocale: input.content.sourceLocale,
    glossaryTerms,
  });

  return {
    pullRunId: input.pullRunId,
    report,
  };
}

export type PreparedProviderAgentQaRun =
  | {
      ok: false;
      agentRunId: string;
      code: string;
      message: string;
    }
  | {
      ok: true;
      agentRunId: string;
      pullRunId: string;
      report: ProviderQaReport;
      alreadyCompleted: true;
    }
  | {
      ok: true;
      projectId: string;
      providerKind: ExternalTmsProviderKind;
      pullRunId: string;
      content: ExternalTmsTaskContent;
      pullFailures: ExternalTmsContentSyncFailure[];
      unitsDiscovered: number;
    };

export async function prepareProviderAgentQaRun(input: {
  agentRunId: string;
  organizationId: string;
}): Promise<PreparedProviderAgentQaRun> {
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

  if (run.kind !== "review") {
    return {
      ok: false,
      agentRunId: input.agentRunId,
      code: "unsupported_agent_run_kind",
      message: `Agent run kind ${run.kind} is not supported for provider QA`,
    };
  }

  if (run.status === "succeeded") {
    const outputSummary = run.outputSummary ?? {};
    const storedReport = readStoredReport(outputSummary);
    return {
      ok: true,
      agentRunId: input.agentRunId,
      pullRunId: readOutputSummaryString(outputSummary, "pullRunId"),
      report: storedReport ?? {
        findings: [],
        summary: { total: 0, byCheckType: {}, bySeverity: {} },
      },
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

  try {
    const pullResult = await pullExternalTmsTaskContent({
      organizationId: input.organizationId,
      projectId,
      providerKind: run.providerKind,
      externalJobId: run.externalJobId,
      pullContent,
    });

    return {
      ok: true,
      projectId,
      providerKind: run.providerKind,
      pullRunId: pullResult.runId,
      content: pullResult.content,
      pullFailures: pullResult.failures,
      unitsDiscovered: pullResult.counts.unitsDiscovered,
    };
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
}

export async function completeProviderAgentQaRun(input: {
  agentRunId: string;
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  pullRunId: string;
  content: ExternalTmsTaskContent;
  pullFailures: ExternalTmsContentSyncFailure[];
  unitsDiscovered: number;
  hlResult: RunHlCheckResult;
  syncProviderReview?: boolean;
  hyperlocaliseJobId?: string | null;
}): Promise<ProviderAgentQaResult> {
  const glossaryTerms = await loadProjectGlossaryTerms(input.projectId);
  const [translationMemoryUsage, glossaryUsage] = await Promise.all([
    collectTranslationMemoryUsageForUnits({
      projectId: input.projectId,
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      sourceLocale: input.content.sourceLocale ?? "en",
      targetLocales: input.content.targetLocales,
      units: input.content.units.map((unit) => ({
        externalStringId: unit.externalStringId,
        key: unit.key,
        sourceText: unit.sourceText,
      })),
    }),
    collectGlossaryUsageForUnits({
      projectId: input.projectId,
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      sourceLocale: input.content.sourceLocale ?? "en",
      targetLocales: input.content.targetLocales,
      units: input.content.units.map((unit) => ({
        externalStringId: unit.externalStringId,
        key: unit.key,
        sourceText: unit.sourceText,
      })),
    }),
  ]);
  const report = await buildProviderJobQaReport(
    input.content,
    {
      targetLocales: input.content.targetLocales,
      sourceLocale: input.content.sourceLocale,
      glossaryTerms,
    },
    input.hlResult,
  );

  const reviewWarnings: string[] = [];
  let reviewReport: ProviderReviewReport = buildProviderReviewReport([]);

  if (input.syncProviderReview) {
    const previousReport = await loadPreviousProviderReviewReport({
      organizationId: input.organizationId,
      hyperlocaliseJobId: input.hyperlocaliseJobId ?? null,
      currentRunId: input.agentRunId,
    });

    try {
      reviewReport =
        (await pullProviderReviewForJob({
          organizationId: input.organizationId,
          projectId: input.projectId,
          providerKind: input.providerKind,
          externalJobId: input.externalJobId,
          content: input.content,
          previousReport,
        })) ?? buildProviderReviewReport([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Provider review comment sync failed";
      reviewWarnings.push(message);
      reviewReport = mergeProviderReviewReports(previousReport, buildProviderReviewReport([]));
    }
  }

  await completeAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
    outputSummary: {
      pullRunId: input.pullRunId,
      unitsDiscovered: input.unitsDiscovered,
      findingCount: report.summary.total,
      findings: report.findings,
      summary: report.summary,
      reviewThreads: reviewReport.threads,
      reviewSummary: reviewReport.summary,
      targetLocales: input.content.targetLocales,
      sourceLocale: input.content.sourceLocale ?? null,
      translationMemoryUsage,
      glossaryUsage,
    },
    changedItems: [],
    warnings: [...input.pullFailures.map((failure) => failure.message), ...reviewWarnings],
  });

  return {
    ok: true,
    agentRunId: input.agentRunId,
    pullRunId: input.pullRunId,
    report,
  };
}

export async function executeProviderAgentQa(input: {
  agentRunId: string;
  organizationId: string;
}): Promise<ProviderAgentQaResult> {
  const prepared = await prepareProviderAgentQaRun(input);
  if (!prepared.ok) {
    return prepared;
  }
  if ("alreadyCompleted" in prepared) {
    return {
      ok: true,
      agentRunId: prepared.agentRunId,
      pullRunId: prepared.pullRunId,
      report: prepared.report,
      alreadyCompleted: true,
    };
  }

  const hlResult = await runHlCheckOnProviderContent({
    content: prepared.content,
    targetLocales: prepared.content.targetLocales,
  });

  const run = await getAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
  });

  return completeProviderAgentQaRun({
    agentRunId: input.agentRunId,
    organizationId: input.organizationId,
    projectId: prepared.projectId,
    providerKind: prepared.providerKind,
    externalJobId: run?.externalJobId ?? "",
    pullRunId: prepared.pullRunId,
    content: prepared.content,
    pullFailures: prepared.pullFailures,
    unitsDiscovered: prepared.unitsDiscovered,
    hlResult,
    syncProviderReview: readInputSnapshotAction(run?.inputSnapshot ?? {}) === "review_with_agent",
    hyperlocaliseJobId: run?.hyperlocaliseJobId ?? null,
  });
}
