import type {
  ExternalTmsContentSyncFailure,
  ExternalTmsTaskContent,
} from "@/lib/providers/tms-provider-types";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type { RunHlCheckResult } from "@/lib/providers/provider-job-qa/run-hl-check";

export async function prepareProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  const { prepareProviderAgentQaRun } =
    await import("@/lib/providers/agent-runs/provider-agent-qa");
  return prepareProviderAgentQaRun(input);
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
  const { getAgentRun } = await import("@/lib/providers/agent-runs/agent-runs");
  const { completeProviderAgentQaRun } =
    await import("@/lib/providers/agent-runs/provider-agent-qa");
  const { readInputSnapshotAction } = await import("@/lib/providers/read-input-snapshot-action");

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
  const { failAgentRun } = await import("@/lib/providers/agent-runs/agent-runs");

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
