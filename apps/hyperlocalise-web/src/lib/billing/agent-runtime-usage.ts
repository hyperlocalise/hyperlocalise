import {
  formatUsageControlError,
  markUsageEventSucceededByOperationKey,
  reserveUsageEvent,
  trackUsageEventInAutumnByOperationKey,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { isErr } from "@/lib/primitives/result/results";

type AgentRuntimeUsageDimensions = Record<string, string | number | boolean | null>;

function logAgentRuntimeUsageError(message: string, input: Record<string, unknown>) {
  console.error(`[agent-runtime-usage] ${message}`, input);
}

export async function reserveAgentRuntimeUsage(input: {
  organizationId: string;
  operationKey: string;
  source: string;
  interactionId?: string | null;
  dimensions?: AgentRuntimeUsageDimensions;
}) {
  const usageEventResult = await reserveUsageEvent({
    organizationId: input.organizationId,
    featureId: usageFeatureIds.agentRuns,
    operationKey: input.operationKey,
    source: input.source,
    interactionId: input.interactionId ?? undefined,
    quantity: 1,
    dimensions: input.dimensions,
  });

  if (isErr(usageEventResult)) {
    logAgentRuntimeUsageError("usage event reservation failed", {
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      source: input.source,
      error: formatUsageControlError(usageEventResult.error),
    });
    return false;
  }

  return true;
}

export async function trackSucceededAgentRuntimeUsage(input: {
  organizationId: string;
  operationKey: string;
  dimensions?: AgentRuntimeUsageDimensions;
}) {
  const markUsageResult = await markUsageEventSucceededByOperationKey({
    operationKey: input.operationKey,
    quantity: 1,
    dimensions: {
      ...input.dimensions,
      autumn_event_name: "agent_run.completed",
      unit: "run",
    },
  });

  if (isErr(markUsageResult)) {
    logAgentRuntimeUsageError("usage event completion failed", {
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      error: formatUsageControlError(markUsageResult.error),
    });
    return;
  }

  const trackUsageResult = await trackUsageEventInAutumnByOperationKey({
    operationKey: input.operationKey,
  });

  if (isErr(trackUsageResult)) {
    logAgentRuntimeUsageError("Autumn usage tracking failed", {
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      error: formatUsageControlError(trackUsageResult.error),
    });
  }
}
