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
import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { Autumn } from "autumn-js";

import { usageFeatureIds } from "@/lib/billing/autumn-ids";
import type { DatabaseClient } from "@/lib/database/client";
import { db, schema } from "@/lib/database/client";

const AUTUMN_API_VERSION = "2.3.0";

export type AiCreditCredentialSource = "gateway" | "byok";

export type AiCreditTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  totalTokens: number;
};

export type ManagedAiCreditError = {
  code: "ai_credit_pricing_not_configured";
  surface: string;
};

export type AutumnTrackTokensResult = {
  value: number;
};

export type AutumnTrackTokensInput = {
  customerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
};

export function billableAutumnTokenUsage(
  credentialSource: AiCreditCredentialSource,
  tokenUsage: AiCreditTokenUsage,
): Pick<
  AutumnTrackTokensInput,
  | "inputTokens"
  | "outputTokens"
  | "cacheReadTokens"
  | "cacheWriteTokens"
  | "reasoningTokens"
  | "audioInputTokens"
  | "audioOutputTokens"
> {
  if (credentialSource === "byok") {
    return {
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    ...(tokenUsage.cacheReadTokens ? { cacheReadTokens: tokenUsage.cacheReadTokens } : {}),
    ...(tokenUsage.cacheWriteTokens ? { cacheWriteTokens: tokenUsage.cacheWriteTokens } : {}),
    ...(tokenUsage.reasoningTokens ? { reasoningTokens: tokenUsage.reasoningTokens } : {}),
    ...(tokenUsage.audioInputTokens ? { audioInputTokens: tokenUsage.audioInputTokens } : {}),
    ...(tokenUsage.audioOutputTokens ? { audioOutputTokens: tokenUsage.audioOutputTokens } : {}),
  };
}

function createAutumnClient(apiKey: string) {
  return new Autumn({
    secretKey: apiKey,
    xApiVersion: AUTUMN_API_VERSION,
    failOpen: false,
  });
}

export async function trackAutumnAiTokens(
  apiKey: string,
  input: AutumnTrackTokensInput,
): Promise<AutumnTrackTokensResult> {
  const autumn = createAutumnClient(apiKey);
  return autumn.trackTokens(input);
}

export class ManagedAiCreditAccessError extends Error {
  readonly billingError: ManagedAiCreditError;

  constructor(billingError: ManagedAiCreditError) {
    super(formatManagedAiCreditError(billingError));
    this.name = "ManagedAiCreditAccessError";
    this.billingError = billingError;
  }
}

export function formatManagedAiCreditError(error: ManagedAiCreditError): string {
  return `AI credit pricing is not configured for ${error.surface}`;
}

export async function listManagedAiCreditReconciliationEvents(input?: {
  db?: DatabaseClient;
  limit?: number;
}) {
  const database = input?.db ?? db;
  const limit = Math.min(500, Math.max(1, input?.limit ?? 100));

  return database
    .select()
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.featureId, usageFeatureIds.aiTokens),
        inArray(schema.usageEvents.status, ["tracking_failed", "settlement_unknown"]),
      ),
    )
    .orderBy(desc(schema.usageEvents.updatedAt))
    .limit(limit);
}
