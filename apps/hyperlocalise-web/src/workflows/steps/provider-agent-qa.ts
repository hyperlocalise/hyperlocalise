import { failAgentRun, getAgentRun } from "@/lib/providers/agent-runs";
import type {
  ExternalTmsContentSyncFailure,
  ExternalTmsTaskContent,
} from "@/lib/providers/external-tms-content-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  completeProviderAgentQaRun,
  prepareProviderAgentQaRun,
} from "@/lib/providers/provider-agent-qa";
import type { RunHlCheckResult } from "@/lib/providers/provider-job-qa/run-hl-check";

export async function prepareProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return prepareProviderAgentQaRun(input);
}

function readInputSnapshotAction(inputSnapshot: Record<string, unknown> | undefined) {
  const action = inputSnapshot?.action;
  return typeof action === "string" ? action : null;
}

export async function completeProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  pullRunId: string;
  content: ExternalTmsTaskContent;
  pullFailures: ExternalTmsContentSyncFailure[];
  unitsDiscovered: number;
  hlResult: RunHlCheckResult;
}) {
  "use step";

  const run = await getAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
  });

  return completeProviderAgentQaRun({
    ...input,
    externalJobId: run?.externalJobId ?? "",
    syncProviderReview: readInputSnapshotAction(run?.inputSnapshot ?? {}) === "review_with_agent",
    hyperlocaliseJobId: run?.hyperlocaliseJobId ?? null,
  });
}

export async function failProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
  code: string;
  message: string;
}) {
  "use step";

  await failAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
    outputSummary: { code: input.code },
    warnings: [input.message],
  });

  return {
    ok: false as const,
    agentRunId: input.agentRunId,
    code: input.code,
    message: input.message,
  };
}
