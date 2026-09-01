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
import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";
import type { SandboxByokCredential } from "@/lib/translation/sandbox-llm";

export type CliTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  modelId?: string;
  credentialSource?: "gateway" | "byok";
};

export type CliBilledTokenUsage = CliTokenUsage & {
  modelId: string;
  credentialSource: "gateway" | "byok";
};

function nonnegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function optionalPositiveInt(value: number): number | undefined {
  return value > 0 ? value : undefined;
}

export function appendHlRunReportOutput(command: string, reportPath: string): string {
  const quotedPath = `'${reportPath.replaceAll("'", "'\\''")}'`;
  return `${command} --output ${quotedPath} --output-detail summary`;
}

export function parseCliTokenUsage(value: unknown): CliTokenUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const inputTokens = nonnegativeInt(record.inputTokens) || nonnegativeInt(record.promptTokens);
  const outputTokens =
    nonnegativeInt(record.outputTokens) || nonnegativeInt(record.completionTokens);
  const cacheReadTokens = nonnegativeInt(record.cachedInputTokens);
  const cacheWriteTokens = nonnegativeInt(record.cacheWriteInputTokens);
  const reasoningTokens = nonnegativeInt(record.reasoningTokens);
  const totalTokens =
    nonnegativeInt(record.totalTokens) ||
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens;

  if (totalTokens <= 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: optionalPositiveInt(cacheReadTokens),
    cacheWriteTokens: optionalPositiveInt(cacheWriteTokens),
    reasoningTokens: optionalPositiveInt(reasoningTokens),
  };
}

export function addCliTokenUsage(
  left: CliTokenUsage | null | undefined,
  right: CliTokenUsage | null | undefined,
): CliTokenUsage | null {
  if (!left) return right ?? null;
  if (!right) return left;

  const cacheReadTokens = (left.cacheReadTokens ?? 0) + (right.cacheReadTokens ?? 0);
  const cacheWriteTokens = (left.cacheWriteTokens ?? 0) + (right.cacheWriteTokens ?? 0);
  const reasoningTokens = (left.reasoningTokens ?? 0) + (right.reasoningTokens ?? 0);

  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    cacheReadTokens: optionalPositiveInt(cacheReadTokens),
    cacheWriteTokens: optionalPositiveInt(cacheWriteTokens),
    reasoningTokens: optionalPositiveInt(reasoningTokens),
    ...((left.modelId ?? right.modelId) ? { modelId: left.modelId ?? right.modelId } : {}),
    ...((left.credentialSource ?? right.credentialSource)
      ? { credentialSource: left.credentialSource ?? right.credentialSource }
      : {}),
  };
}

export function sandboxTranslationBillingMetadata(
  byok?: SandboxByokCredential | null,
): Pick<CliBilledTokenUsage, "modelId" | "credentialSource"> {
  if (byok) {
    return {
      modelId: byok.model,
      credentialSource: "byok",
    };
  }

  return {
    modelId: `openai/${hyperlocaliseAgentModelId}`,
    credentialSource: "gateway",
  };
}

export function withCliBillingMetadata(
  usage: CliTokenUsage | null | undefined,
  byok?: SandboxByokCredential | null,
): CliBilledTokenUsage | null {
  if (!usage) {
    return null;
  }

  return {
    ...usage,
    ...sandboxTranslationBillingMetadata(byok),
  };
}
