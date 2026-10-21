/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";

import { AiFeaturesRequiredError, ensureAiFeaturesAllowed } from "@/lib/billing/ai-features";
import {
  completeAndTrackBillableUsage,
  formatUsageControlError,
  reserveUsageEvent,
  trackAiCreditUsageInAutumn,
  usageFeatureIds,
  type AiTokenUsage,
} from "@/lib/billing/usage-control";
import type { AiCreditCredentialSource } from "@/lib/billing/managed-ai-credit";
import { serializeErrorForLog } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { hyperlocaliseManagedGatewayModelId } from "@/lib/providers/language-model";

export type AgentRuntimeUsageDimensions = Record<string, string | number | boolean | null>;

function logAgentRuntimeUsageError(message: string, input: Record<string, unknown>) {
  console.error(`[agent-runtime-usage] ${message}`, input);
}

export function extractAiSdkTokenUsage(usage: unknown): AiTokenUsage | null {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const raw = usage as {
    inputTokens?: unknown;
    inputTokenDetails?: {
      noCacheTokens?: unknown;
      cacheReadTokens?: unknown;
      cacheWriteTokens?: unknown;
    };
    outputTokens?: unknown;
    outputTokenDetails?: {
      textTokens?: unknown;
      reasoningTokens?: unknown;
    };
    totalTokens?: unknown;
  };
  const totalInputTokens = typeof raw.inputTokens === "number" ? raw.inputTokens : 0;
  const cacheReadTokens =
    typeof raw.inputTokenDetails?.cacheReadTokens === "number"
      ? raw.inputTokenDetails.cacheReadTokens
      : 0;
  const cacheWriteTokens =
    typeof raw.inputTokenDetails?.cacheWriteTokens === "number"
      ? raw.inputTokenDetails.cacheWriteTokens
      : 0;
  const inputTokens =
    typeof raw.inputTokenDetails?.noCacheTokens === "number"
      ? raw.inputTokenDetails.noCacheTokens
      : Math.max(0, totalInputTokens - cacheReadTokens - cacheWriteTokens);
  const reasoningTokens =
    typeof raw.outputTokenDetails?.reasoningTokens === "number"
      ? raw.outputTokenDetails.reasoningTokens
      : 0;
  const totalOutputTokens = typeof raw.outputTokens === "number" ? raw.outputTokens : 0;
  const outputTokens =
    typeof raw.outputTokenDetails?.textTokens === "number"
      ? raw.outputTokenDetails.textTokens
      : Math.max(0, totalOutputTokens - reasoningTokens);
  const totalTokens =
    typeof raw.totalTokens === "number"
      ? raw.totalTokens
      : inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens + reasoningTokens;

  if (totalTokens <= 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
  };
}

/** Prefer AI SDK 7 `usage`, then its deprecated `totalUsage` alias. */
export function extractGenerateResultTokenUsage(result: {
  totalUsage?: unknown;
  usage?: unknown;
}): AiTokenUsage | null {
  return extractAiSdkTokenUsage(result.usage) ?? extractAiSdkTokenUsage(result.totalUsage);
}

export function addAiTokenUsage(
  first: AiTokenUsage | null | undefined,
  second: AiTokenUsage | null | undefined,
): AiTokenUsage | null {
  if (!first) return second ?? null;
  if (!second) return first;

  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    totalTokens: first.totalTokens + second.totalTokens,
    cacheReadTokens: (first.cacheReadTokens ?? 0) + (second.cacheReadTokens ?? 0),
    cacheWriteTokens: (first.cacheWriteTokens ?? 0) + (second.cacheWriteTokens ?? 0),
    reasoningTokens: (first.reasoningTokens ?? 0) + (second.reasoningTokens ?? 0),
    audioInputTokens: (first.audioInputTokens ?? 0) + (second.audioInputTokens ?? 0),
    audioOutputTokens: (first.audioOutputTokens ?? 0) + (second.audioOutputTokens ?? 0),
  };
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
  aiCreditModelId?: string;
  aiCreditCredentialSource?: AiCreditCredentialSource;
  aiCreditSource?: string;
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
      aiCreditModelId: input.aiCreditModelId,
      aiCreditCredentialSource: input.aiCreditCredentialSource,
      interactionId: input.interactionId ?? undefined,
      aiCreditSource: input.aiCreditSource ?? "agent_runtime_complete",
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
 * Check AI access and reserve agent_runs usage for work that may finish in a
 * later process (for example a later workflow step). Pair with
 * {@link completeAgentRuntimeUsage} using the same operation key.
 */
export async function beginAgentRuntimeUsage(input: {
  organizationId: string;
  operationKey: string;
  source: string;
  interactionId?: string | null;
  dimensions?: AgentRuntimeUsageDimensions;
}) {
  const aiFeatures = await ensureAiFeaturesAllowed({ organizationId: input.organizationId });
  if (!aiFeatures.ok) {
    throw new AiFeaturesRequiredError(aiFeatures.error);
  }

  await reserveAgentRuntimeUsage(input);
}

/** Complete a reservation from {@link beginAgentRuntimeUsage} once the work succeeds. */
export async function completeAgentRuntimeUsage(input: {
  organizationId: string;
  operationKey: string;
  interactionId?: string | null;
  dimensions?: AgentRuntimeUsageDimensions;
  tokenUsage: AiTokenUsage | null;
  aiCreditModelId?: string;
  aiCreditCredentialSource?: AiCreditCredentialSource;
  aiCreditSource?: string;
}) {
  const billableTokenUsage =
    input.tokenUsage && input.tokenUsage.totalTokens > 0 ? input.tokenUsage : null;

  await trackSucceededAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    dimensions: input.dimensions,
    interactionId: input.interactionId,
    tokenUsage: billableTokenUsage,
    aiCreditModelId:
      input.aiCreditModelId ??
      (billableTokenUsage ? hyperlocaliseManagedGatewayModelId : undefined),
    aiCreditCredentialSource:
      input.aiCreditCredentialSource ?? (billableTokenUsage ? "gateway" : undefined),
    aiCreditSource: input.aiCreditSource,
  });
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
  aiCreditModelId?: string | ((result: T) => string | undefined);
  aiCreditCredentialSource?:
    | AiCreditCredentialSource
    | ((result: T) => AiCreditCredentialSource | undefined);
  aiCreditSource?: string;
}): Promise<T> {
  await beginAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    source: input.source,
    interactionId: input.interactionId,
    dimensions: input.dimensions,
  });

  const result = await input.run();

  await completeAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    dimensions: input.dimensions,
    interactionId: input.interactionId,
    tokenUsage: input.extractTokenUsage?.(result) ?? null,
    aiCreditModelId:
      typeof input.aiCreditModelId === "function"
        ? input.aiCreditModelId(result)
        : input.aiCreditModelId,
    aiCreditCredentialSource:
      typeof input.aiCreditCredentialSource === "function"
        ? input.aiCreditCredentialSource(result)
        : input.aiCreditCredentialSource,
    aiCreditSource: input.aiCreditSource,
  });

  return result;
}

/**
 * The model that served a generate result, for billing: calls through our AI Gateway report the
 * provider `gateway`; anything else ran on the workspace's own key and is recorded at no charge.
 * Own-key model ids are a label only (`<provider>/<model>`).
 */
export function billingModelFromSteps(result: {
  steps?: ReadonlyArray<{ model?: { provider?: string; modelId?: string } }>;
}): { modelId: string; credentialSource: AiCreditCredentialSource } | null {
  const model = result.steps?.find((step) => step.model?.provider && step.model.modelId)?.model;
  if (!model?.provider || !model.modelId) {
    return null;
  }

  if (model.provider === "gateway") {
    return { modelId: model.modelId, credentialSource: "gateway" };
  }

  return { modelId: `${model.provider.split(".")[0]}/${model.modelId}`, credentialSource: "byok" };
}

/**
 * Records the tokens of one AI call that is not part of an agent run or job, as
 * AI Credit only. `source` names where the call came from. Never throws: a
 * metering failure is logged and the caller's work continues.
 */
export async function trackAiCallTokenUsage(input: {
  organizationId: string;
  source: string;
  tokenUsage: AiTokenUsage | null | undefined;
  modelId: string;
  credentialSource: AiCreditCredentialSource;
  interactionId?: string | null;
}) {
  const tokenUsage = input.tokenUsage;
  if (!tokenUsage || tokenUsage.totalTokens <= 0) {
    return;
  }

  const operationKey = `ai-call:${input.source}:${randomUUID()}`;
  try {
    const result = await trackAiCreditUsageInAutumn({
      organizationId: input.organizationId,
      parentOperationKey: operationKey,
      tokenUsage,
      source: input.source,
      modelId: input.modelId,
      credentialSource: input.credentialSource,
      interactionId: input.interactionId ?? undefined,
    });

    if (isErr(result)) {
      logAgentRuntimeUsageError("AI call token tracking failed", {
        organizationId: input.organizationId,
        operationKey,
        source: input.source,
        error: formatUsageControlError(result.error),
      });
    }
  } catch (error) {
    logAgentRuntimeUsageError("AI call token tracking threw", {
      organizationId: input.organizationId,
      operationKey,
      source: input.source,
      err: serializeErrorForLog(error),
    });
  }
}
