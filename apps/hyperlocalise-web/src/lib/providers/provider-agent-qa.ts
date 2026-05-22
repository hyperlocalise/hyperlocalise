import {
  completeAgentRun,
  failAgentRun,
  getAgentRun,
  startAgentRun,
} from "@/lib/providers/agent-runs";
import {
  pullExternalTmsTaskContent,
  type ExternalTmsTaskContent,
} from "@/lib/providers/external-tms-content-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import { loadProjectGlossaryTerms } from "@/lib/providers/provider-job-qa/load-glossary-terms";
import { runProviderJobQa } from "@/lib/providers/provider-job-qa/run-provider-job-qa";
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

export async function executeProviderAgentQa(input: {
  agentRunId: string;
  organizationId: string;
}): Promise<ProviderAgentQaResult> {
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
      report:
        storedReport ??
        (await runProviderJobQa(
          {
            externalJobId: run.externalJobId,
            targetLocales: [],
            units: [],
          },
          { targetLocales: [] },
        )),
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

  const qaResult = await executeProviderJobQaForContent({
    organizationId: input.organizationId,
    projectId,
    providerKind: run.providerKind,
    externalJobId: run.externalJobId,
    content: pullResult.content,
    pullRunId: pullResult.runId,
  });

  await completeAgentRun({
    runId: run.id,
    organizationId: input.organizationId,
    outputSummary: {
      pullRunId: qaResult.pullRunId,
      unitsDiscovered: pullResult.counts.unitsDiscovered,
      findingCount: qaResult.report.summary.total,
      findings: qaResult.report.findings,
      summary: qaResult.report.summary,
      targetLocales: pullResult.content.targetLocales,
      sourceLocale: pullResult.content.sourceLocale ?? null,
    },
    changedItems: [],
    warnings: pullResult.failures.map((failure) => failure.message),
  });

  return {
    ok: true,
    agentRunId: input.agentRunId,
    pullRunId: qaResult.pullRunId,
    report: qaResult.report,
  };
}
