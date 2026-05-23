import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  startAgentRun,
} from "@/lib/providers/agent-runs";
import {
  pullExternalTmsTaskContent,
  type ExternalTmsContentSyncFailure,
  type ExternalTmsTaskContent,
} from "@/lib/providers/external-tms-content-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
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
  pullRunId: string;
  content: ExternalTmsTaskContent;
  pullFailures: ExternalTmsContentSyncFailure[];
  unitsDiscovered: number;
  hlResult: RunHlCheckResult;
}): Promise<ProviderAgentQaResult> {
  const glossaryTerms = await loadProjectGlossaryTerms(input.projectId);
  const translationMemoryUsage = await collectTranslationMemoryUsageForUnits({
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
  });
  const report = await buildProviderJobQaReport(
    input.content,
    {
      targetLocales: input.content.targetLocales,
      sourceLocale: input.content.sourceLocale,
      glossaryTerms,
    },
    input.hlResult,
  );

  await completeAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
    outputSummary: {
      pullRunId: input.pullRunId,
      unitsDiscovered: input.unitsDiscovered,
      findingCount: report.summary.total,
      findings: report.findings,
      summary: report.summary,
      targetLocales: input.content.targetLocales,
      sourceLocale: input.content.sourceLocale ?? null,
      translationMemoryUsage,
    },
    changedItems: [],
    warnings: input.pullFailures.map((failure) => failure.message),
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

  return completeProviderAgentQaRun({
    agentRunId: input.agentRunId,
    organizationId: input.organizationId,
    projectId: prepared.projectId,
    providerKind: prepared.providerKind,
    pullRunId: prepared.pullRunId,
    content: prepared.content,
    pullFailures: prepared.pullFailures,
    unitsDiscovered: prepared.unitsDiscovered,
    hlResult,
  });
}
