import {
  completeAndTrackBillableUsage,
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { serializeErrorForLog } from "@/lib/log";
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
  try {
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
  } catch (error) {
    logAgentRuntimeUsageError("usage event reservation threw", {
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      source: input.source,
      err: serializeErrorForLog(error),
    });
    return false;
  }
}

export async function trackSucceededAgentRuntimeUsage(input: {
  organizationId: string;
  operationKey: string;
  dimensions?: AgentRuntimeUsageDimensions;
}) {
  try {
    const trackUsageResult = await completeAndTrackBillableUsage({
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      autumnEventName: "agent_run.completed",
      unit: "run",
      dimensions: input.dimensions,
      aiCreditSource: "agent_runtime_complete",
    });

    if (isErr(trackUsageResult)) {
      logAgentRuntimeUsageError("usage event completion failed", {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
        dimensions: input.dimensions,
        error: formatUsageControlError(trackUsageResult.error),
      });
    }
  } catch (error) {
    logAgentRuntimeUsageError("usage event completion threw", {
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      err: serializeErrorForLog(error),
    });
  }
}
