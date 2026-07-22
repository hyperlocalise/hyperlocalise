/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  completeAndTrackBillableUsage,
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
  type AiTokenUsage,
} from "@/lib/billing/usage-control";
import { serializeErrorForLog } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

type AgentRuntimeUsageDimensions = Record<string, string | number | boolean | null>;

function logAgentRuntimeUsageError(message: string, input: Record<string, unknown>) {
  console.error(`[agent-runtime-usage] ${message}`, input);
}

export function extractAiSdkTokenUsage(usage: unknown): AiTokenUsage | null {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const raw = usage as {
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
  };
  const inputTokens = typeof raw.inputTokens === "number" ? raw.inputTokens : 0;
  const outputTokens = typeof raw.outputTokens === "number" ? raw.outputTokens : 0;
  const totalTokens =
    typeof raw.totalTokens === "number" ? raw.totalTokens : inputTokens + outputTokens;

  if (totalTokens <= 0) {
    return null;
  }

  return { inputTokens, outputTokens, totalTokens };
}

/** Prefer totalUsage from multi-step ToolLoopAgent results, then usage. */
export function extractGenerateResultTokenUsage(result: {
  totalUsage?: unknown;
  usage?: unknown;
}): AiTokenUsage | null {
  return extractAiSdkTokenUsage(result.totalUsage) ?? extractAiSdkTokenUsage(result.usage);
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
  tokenUsage?: AiTokenUsage | null;
  interactionId?: string | null;
}) {
  try {
    const trackUsageResult = await completeAndTrackBillableUsage({
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      autumnEventName: "agent_run.completed",
      unit: "run",
      dimensions: input.dimensions,
      tokenUsage: input.tokenUsage ?? null,
      interactionId: input.interactionId ?? undefined,
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

/**
 * Reserve agent_runs usage, run the work, then complete (+ optional AI Credit)
 * only when the work succeeds. Failures leave the reservation unbilled.
 */
export async function withAgentRuntimeUsageMetering<T>(input: {
  organizationId: string;
  operationKey: string;
  source: string;
  interactionId?: string | null;
  dimensions?: AgentRuntimeUsageDimensions;
  run: () => Promise<T>;
  extractTokenUsage?: (result: T) => AiTokenUsage | null;
}): Promise<T> {
  await reserveAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    source: input.source,
    interactionId: input.interactionId,
    dimensions: input.dimensions,
  });

  const result = await input.run();

  await trackSucceededAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    dimensions: input.dimensions,
    interactionId: input.interactionId,
    tokenUsage: input.extractTokenUsage?.(result) ?? null,
  });

  return result;
}
