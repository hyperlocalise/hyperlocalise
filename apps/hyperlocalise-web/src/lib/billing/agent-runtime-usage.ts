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
import {
  completeAndTrackBillableUsage,
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
  type AiTokenUsage,
} from "@/lib/billing/usage-control";
import {
  formatManagedAiCreditError,
  getManagedAiCreditReservation,
  ManagedAiCreditAccessError,
  releaseManagedAiCredit,
  reserveManagedAiCredit,
  type AiCreditCredentialSource,
  type ManagedAiCreditError,
  type ManagedAiCreditReservation,
} from "@/lib/billing/managed-ai-credit";
import {
  getManagedAiPricingConfig,
  managedAiReservationAmountUsd,
} from "@/lib/billing/managed-ai-pricing";
import { serializeErrorForLog } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { hyperlocaliseManagedGatewayModelId } from "@/lib/providers/language-model";

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

export function agentRunAiCreditOperationKey(runId: string) {
  return `agent-run:${runId}:agent_runs:ai_tokens`;
}

export async function reserveAgentRunAiCredit(input: {
  organizationId: string;
  runId: string;
  source?: string;
  modelId: string;
  credentialSource: AiCreditCredentialSource;
}): Promise<Result<ManagedAiCreditReservation | null, ManagedAiCreditError>> {
  const pricingConfig = getManagedAiPricingConfig();
  if (pricingConfig.mode === "legacy") {
    return ok(null);
  }

  const operationKey = agentRunAiCreditOperationKey(input.runId);
  const existing = await getManagedAiCreditReservation({ operationKey });
  if (existing) {
    return ok(existing);
  }

  const estimatedAmountUsd =
    input.credentialSource === "byok"
      ? 0
      : managedAiReservationAmountUsd(pricingConfig, { surface: "chat" });
  if (estimatedAmountUsd == null) {
    return err({
      code: "ai_credit_pricing_not_configured",
      surface: input.source ?? "agent_run",
    });
  }

  return reserveManagedAiCredit({
    organizationId: input.organizationId,
    operationKey,
    source: input.source ?? "agent_run_create",
    modelId: input.modelId,
    credentialSource: input.credentialSource,
    estimatedAmountUsd,
    mode: pricingConfig.mode,
    dimensions: {
      surface: "provider_agent",
    },
  });
}

export async function releaseAgentRunAiCredit(input: { runId: string; reason: string }) {
  const reservation = await getManagedAiCreditReservation({
    operationKey: agentRunAiCreditOperationKey(input.runId),
  });
  if (!reservation) {
    return;
  }

  const released = await releaseManagedAiCredit({
    reservation,
    reason: input.reason,
  });
  if (!released.ok) {
    logAgentRuntimeUsageError("AI credit release failed", {
      runId: input.runId,
      error: formatManagedAiCreditError(released.error),
    });
  }
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
  aiCreditEstimatedAmountUsd?: number;
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
      aiCreditEstimatedAmountUsd: input.aiCreditEstimatedAmountUsd,
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
  aiCreditModelId?: string;
  aiCreditCredentialSource?: AiCreditCredentialSource;
  aiCreditEstimatedAmountUsd?: number;
}): Promise<T> {
  await reserveAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    source: input.source,
    interactionId: input.interactionId,
    dimensions: input.dimensions,
  });

  const pricingConfig = getManagedAiPricingConfig();
  const tokenMeteringEnabled = input.extractTokenUsage && pricingConfig.mode !== "legacy";
  const aiCreditModelId =
    input.aiCreditModelId ??
    (tokenMeteringEnabled ? hyperlocaliseManagedGatewayModelId : undefined);
  const aiCreditCredentialSource =
    input.aiCreditCredentialSource ?? (tokenMeteringEnabled ? "gateway" : undefined);
  const aiCreditEstimatedAmountUsd =
    aiCreditCredentialSource === "byok"
      ? 0
      : (input.aiCreditEstimatedAmountUsd ??
        managedAiReservationAmountUsd(pricingConfig, { surface: "chat" }) ??
        undefined);
  let aiCreditReservation: ManagedAiCreditReservation | null = null;

  if (
    tokenMeteringEnabled &&
    aiCreditModelId &&
    aiCreditCredentialSource &&
    aiCreditEstimatedAmountUsd != null
  ) {
    const reservation = await reserveManagedAiCredit({
      organizationId: input.organizationId,
      operationKey: `${input.operationKey}:ai_tokens`,
      source: input.source,
      modelId: aiCreditModelId,
      credentialSource: aiCreditCredentialSource,
      estimatedAmountUsd: aiCreditEstimatedAmountUsd,
      interactionId: input.interactionId ?? undefined,
      mode: pricingConfig.mode,
      dimensions: input.dimensions,
    });
    if (!reservation.ok) {
      throw new ManagedAiCreditAccessError(reservation.error);
    }
    aiCreditReservation = reservation.value;
  } else if (tokenMeteringEnabled) {
    throw new ManagedAiCreditAccessError({
      code: "ai_credit_pricing_not_configured",
      surface: input.source,
    });
  }

  let result: T;
  try {
    result = await input.run();
  } catch (error) {
    if (aiCreditReservation) {
      await releaseManagedAiCredit({
        reservation: aiCreditReservation,
        reason: "agent_runtime_failed",
      });
    }
    throw error;
  }
  const tokenUsage = input.extractTokenUsage?.(result) ?? null;
  const billableTokenUsage = tokenUsage && tokenUsage.totalTokens > 0 ? tokenUsage : null;
  if (!billableTokenUsage && aiCreditReservation) {
    await releaseManagedAiCredit({
      reservation: aiCreditReservation,
      reason: "no_token_usage",
    });
  }

  await trackSucceededAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    dimensions: input.dimensions,
    interactionId: input.interactionId,
    tokenUsage: billableTokenUsage,
    aiCreditModelId,
    aiCreditCredentialSource,
    aiCreditEstimatedAmountUsd,
  });

  return result;
}
