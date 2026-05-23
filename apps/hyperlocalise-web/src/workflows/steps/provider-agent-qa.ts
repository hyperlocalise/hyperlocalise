import { failAgentRun } from "@/lib/providers/agent-runs";
import type { ExternalTmsContentSyncFailure, ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";
import {
  completeProviderAgentQaRun,
  executeProviderAgentQa,
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

export async function completeProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
  projectId: string;
  pullRunId: string;
  content: Parameters<typeof completeProviderAgentQaRun>[0]["content"];
  pullFailures: Parameters<typeof completeProviderAgentQaRun>[0]["pullFailures"];
  unitsDiscovered: number;
  hlResult: Parameters<typeof completeProviderAgentQaRun>[0]["hlResult"];
}) {
  "use step";
  return completeProviderAgentQaRun(input);
}

export async function executeProviderAgentQaStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  return executeProviderAgentQa(input);
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
