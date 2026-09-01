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

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Autumn } from "autumn-js";

import { usageFeatureIds } from "@/lib/billing/autumn-ids";
import {
  getManagedAiPricingConfig,
  normalizeUsdAmount,
  type AiCreditMeteringMode,
} from "@/lib/billing/managed-ai-pricing";
import type { DatabaseClient, DatabaseTransaction } from "@/lib/database/client";
import { db, schema } from "@/lib/database/client";
import { getAutumnSecretKey } from "@/lib/billing/autumn-config";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const AUTUMN_API_VERSION = "2.3.0";
const OUTSTANDING_AI_CREDIT_STATUSES = [
  "reserved",
  "succeeded",
  "tracking_pending",
  "tracking_failed",
  "settlement_unknown",
] as const;

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

export type ManagedAiCreditReservation = {
  operationKey: string;
  mode: AiCreditMeteringMode;
  credentialSource: AiCreditCredentialSource;
  estimatedAmountUsd: number;
};

export type ManagedAiCreditError =
  | {
      code: "ai_credit_pricing_not_configured";
      surface: string;
    }
  | {
      code: "ai_credit_not_configured";
    }
  | {
      code: "ai_credit_insufficient";
      requiredAmountUsd: number;
      remainingAmountUsd: number;
    }
  | {
      code: "ai_credit_check_failed";
      message: string;
    }
  | {
      code: "ai_credit_reservation_failed";
      operationKey: string;
    }
  | {
      code: "ai_credit_operation_already_exists";
      operationKey: string;
      status: (typeof schema.usageEvents.$inferSelect)["status"];
    }
  | {
      code: "ai_credit_usage_not_found";
      operationKey: string;
    }
  | {
      code: "ai_credit_settlement_in_progress";
      operationKey: string;
    }
  | {
      code: "ai_credit_tracking_failed";
      operationKey: string;
      message: string;
      settlementUnknown: boolean;
    };

export class ManagedAiCreditAccessError extends Error {
  readonly billingError: ManagedAiCreditError;

  constructor(billingError: ManagedAiCreditError) {
    super(formatManagedAiCreditError(billingError));
    this.name = "ManagedAiCreditAccessError";
    this.billingError = billingError;
  }
}

type AutumnCheckResult = {
  allowed: boolean;
  balance: {
    remaining?: number | null;
    unlimited?: boolean | null;
    overageAllowed?: boolean | null;
  } | null;
};

type AutumnTrackTokensResult = {
  value: number;
};

type ManagedAiCreditDependencies = {
  check?: (input: {
    customerId: string;
    featureId: string;
    requiredBalance: number;
  }) => Promise<AutumnCheckResult>;
  trackTokens?: (input: {
    customerId: string;
    featureId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    audioInputTokens?: number;
    audioOutputTokens?: number;
    overageBehavior: "cap" | "overflow";
    properties: Record<string, unknown>;
  }) => Promise<AutumnTrackTokensResult>;
};

type ManagedAiUsageDimensions = Record<string, string | number | boolean | null>;

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "managed_ai_credit_failed";
}

function positiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function createAutumnClient(apiKey: string) {
  return new Autumn({
    secretKey: apiKey,
    xApiVersion: AUTUMN_API_VERSION,
    failOpen: false,
  });
}

async function lockManagedAiCredit(tx: DatabaseTransaction, organizationId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${["managed_ai_credit", organizationId].join(
      ":",
    )}, 0))`,
  );
}

async function outstandingReservationUsd(
  database: DatabaseClient,
  organizationId: string,
  excludedOperationKey: string,
) {
  const [result] = await database
    .select({
      value: sql<string>`coalesce(sum(${schema.usageEvents.estimatedAmountUsd}), 0)::text`,
    })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.organizationId, organizationId),
        eq(schema.usageEvents.featureId, usageFeatureIds.aiTokens),
        inArray(schema.usageEvents.status, OUTSTANDING_AI_CREDIT_STATUSES),
        ne(schema.usageEvents.operationKey, excludedOperationKey),
      ),
    );

  return positiveNumber(Number(result?.value ?? 0));
}

async function findUsageEvent(database: DatabaseClient, operationKey: string) {
  const [event] = await database
    .select()
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, operationKey))
    .limit(1);
  return event;
}

export async function getManagedAiCreditReservation(input: {
  db?: DatabaseClient;
  operationKey: string;
}): Promise<ManagedAiCreditReservation | null> {
  const event = await findUsageEvent(input.db ?? db, input.operationKey);
  if (!event) return null;
  const storedMode = event.dimensions.metering_mode;
  const mode: AiCreditMeteringMode =
    storedMode === "shadow" || storedMode === "enforced" ? storedMode : "legacy";

  return {
    operationKey: event.operationKey,
    mode,
    credentialSource: event.credentialSource === "byok" ? "byok" : "gateway",
    estimatedAmountUsd: positiveNumber(Number(event.estimatedAmountUsd ?? 0)),
  };
}

export function formatManagedAiCreditError(error: ManagedAiCreditError): string {
  switch (error.code) {
    case "ai_credit_pricing_not_configured":
      return `AI credit pricing is not configured for ${error.surface}`;
    case "ai_credit_not_configured":
      return "AI credit billing is not configured";
    case "ai_credit_insufficient":
      return "Insufficient AI credit for this request";
    case "ai_credit_check_failed":
      return error.message;
    case "ai_credit_reservation_failed":
      return `Failed to reserve AI credit for ${error.operationKey}`;
    case "ai_credit_operation_already_exists":
      return `AI credit operation ${error.operationKey} already exists with status ${error.status}`;
    case "ai_credit_usage_not_found":
      return `AI credit usage event not found for ${error.operationKey}`;
    case "ai_credit_settlement_in_progress":
      return `AI credit settlement is already in progress for ${error.operationKey}`;
    case "ai_credit_tracking_failed":
      return error.message;
  }
}

export async function reserveManagedAiCredit(input: {
  db?: DatabaseTransaction;
  organizationId: string;
  operationKey: string;
  source: string;
  modelId: string;
  credentialSource: AiCreditCredentialSource;
  estimatedAmountUsd: number;
  dimensions?: ManagedAiUsageDimensions;
  interactionId?: string;
  jobId?: string;
  mode?: AiCreditMeteringMode;
  autumnApiKey?: string;
  dependencies?: ManagedAiCreditDependencies;
}): Promise<Result<ManagedAiCreditReservation, ManagedAiCreditError>> {
  if (
    !Number.isFinite(input.estimatedAmountUsd) ||
    (input.credentialSource === "gateway" && input.estimatedAmountUsd <= 0) ||
    input.estimatedAmountUsd < 0
  ) {
    return err({
      code: "ai_credit_pricing_not_configured",
      surface: input.source,
    });
  }

  const mode = input.mode ?? getManagedAiPricingConfig().mode;
  const run = async (
    tx: DatabaseTransaction,
  ): Promise<Result<ManagedAiCreditReservation, ManagedAiCreditError>> => {
    await lockManagedAiCredit(tx, input.organizationId);

    const existing = await findUsageEvent(tx, input.operationKey);
    if (existing) {
      return err({
        code: "ai_credit_operation_already_exists",
        operationKey: existing.operationKey,
        status: existing.status,
      });
    }

    let overageAllowed = false;
    if (mode === "enforced" && input.credentialSource === "gateway") {
      const apiKey = input.autumnApiKey ?? getAutumnSecretKey();
      if (!apiKey && !input.dependencies?.check) {
        return err({ code: "ai_credit_not_configured" });
      }

      const outstandingUsd = await outstandingReservationUsd(
        tx,
        input.organizationId,
        input.operationKey,
      );
      const requiredBalance = input.estimatedAmountUsd + outstandingUsd;

      try {
        const autumn = apiKey ? createAutumnClient(apiKey) : null;
        const check =
          input.dependencies?.check ??
          (async (params: { customerId: string; featureId: string; requiredBalance: number }) => {
            if (!autumn) throw new Error("Autumn is not configured");
            return autumn.check({
              ...params,
              withPreview: true,
            });
          });
        const response = await check({
          customerId: input.organizationId,
          featureId: usageFeatureIds.aiTokens,
          requiredBalance,
        });
        const remainingAmountUsd = positiveNumber(response.balance?.remaining);
        overageAllowed = response.balance?.overageAllowed === true;
        const allowed =
          response.allowed &&
          (response.balance?.unlimited === true ||
            overageAllowed ||
            remainingAmountUsd >= requiredBalance);

        if (!allowed) {
          return err({
            code: "ai_credit_insufficient",
            requiredAmountUsd: input.estimatedAmountUsd,
            remainingAmountUsd: Math.max(0, remainingAmountUsd - outstandingUsd),
          });
        }
      } catch (error) {
        return err({
          code: "ai_credit_check_failed",
          message: safeErrorMessage(error),
        });
      }
    }

    const [event] = await tx
      .insert(schema.usageEvents)
      .values({
        organizationId: input.organizationId,
        featureId: usageFeatureIds.aiTokens,
        operationKey: input.operationKey,
        source: input.source,
        quantity: 1,
        estimatedAmountUsd: normalizeUsdAmount(input.estimatedAmountUsd),
        modelId: input.modelId,
        credentialSource: input.credentialSource,
        reservationKey: input.operationKey,
        interactionId: input.interactionId,
        jobId: input.jobId,
        dimensions: {
          ...input.dimensions,
          unit: "usd",
          pricing_version: getManagedAiPricingConfig().pricingVersion,
          metering_mode: mode,
          overage_allowed: overageAllowed,
        },
      })
      .onConflictDoNothing({ target: schema.usageEvents.operationKey })
      .returning({ id: schema.usageEvents.id });

    if (!event) {
      const duplicate = await findUsageEvent(tx, input.operationKey);
      if (!duplicate) {
        return err({
          code: "ai_credit_reservation_failed",
          operationKey: input.operationKey,
        });
      }
      return err({
        code: "ai_credit_operation_already_exists",
        operationKey: duplicate.operationKey,
        status: duplicate.status,
      });
    }

    return ok({
      operationKey: input.operationKey,
      mode,
      credentialSource: input.credentialSource,
      estimatedAmountUsd: input.estimatedAmountUsd,
    });
  };

  if (input.db) return run(input.db);
  return db.transaction(run);
}

export async function settleManagedAiCredit(input: {
  db?: DatabaseClient;
  reservation: ManagedAiCreditReservation;
  modelId: string;
  tokenUsage: AiCreditTokenUsage;
  providerGenerationId?: string;
  shadowAmountUsd?: number;
  autumnApiKey?: string;
  dependencies?: ManagedAiCreditDependencies;
}): Promise<
  Result<{ amountUsd: number; status: "already_settled" | "settled" }, ManagedAiCreditError>
> {
  const database = input.db ?? db;
  const event = await findUsageEvent(database, input.reservation.operationKey);
  if (!event) {
    return err({
      code: "ai_credit_usage_not_found",
      operationKey: input.reservation.operationKey,
    });
  }

  if (event.status === "tracking_succeeded") {
    return ok({
      amountUsd: positiveNumber(Number(event.amountUsd ?? 0)),
      status: "already_settled",
    });
  }
  if (event.status === "settlement_unknown") {
    if (!event.autumnTrackError) {
      return err({
        code: "ai_credit_settlement_in_progress",
        operationKey: event.operationKey,
      });
    }
    return err({
      code: "ai_credit_tracking_failed",
      operationKey: event.operationKey,
      message: event.autumnTrackError ?? "AI credit settlement outcome is unknown",
      settlementUnknown: true,
    });
  }

  const tokenDimensions = {
    ...event.dimensions,
    input_tokens: input.tokenUsage.inputTokens,
    output_tokens: input.tokenUsage.outputTokens,
    cache_read_tokens: input.tokenUsage.cacheReadTokens ?? 0,
    cache_write_tokens: input.tokenUsage.cacheWriteTokens ?? 0,
    reasoning_tokens: input.tokenUsage.reasoningTokens ?? 0,
    audio_input_tokens: input.tokenUsage.audioInputTokens ?? 0,
    audio_output_tokens: input.tokenUsage.audioOutputTokens ?? 0,
    total_tokens: input.tokenUsage.totalTokens,
  };

  if (input.reservation.credentialSource === "byok" || input.reservation.mode === "shadow") {
    const amountUsd =
      input.reservation.credentialSource === "byok"
        ? 0
        : positiveNumber(input.shadowAmountUsd ?? input.reservation.estimatedAmountUsd);
    await database
      .update(schema.usageEvents)
      .set({
        status: "tracking_succeeded",
        amountUsd: normalizeUsdAmount(amountUsd),
        providerGenerationId: input.providerGenerationId,
        dimensions: tokenDimensions,
        autumnTrackError: null,
      })
      .where(eq(schema.usageEvents.id, event.id));
    return ok({ amountUsd, status: "settled" });
  }

  const apiKey = input.autumnApiKey ?? getAutumnSecretKey();
  if (!apiKey && !input.dependencies?.trackTokens) {
    return err({ code: "ai_credit_not_configured" });
  }

  const [claimedEvent] = await database
    .update(schema.usageEvents)
    .set({
      // trackTokens has no documented idempotency key. Mark the dispatch as
      // ambiguous before the network call so a process crash cannot trigger a blind retry.
      status: "settlement_unknown",
      modelId: input.modelId,
      providerGenerationId: input.providerGenerationId,
      dimensions: tokenDimensions,
      autumnTrackError: null,
    })
    .where(
      and(
        eq(schema.usageEvents.id, event.id),
        inArray(schema.usageEvents.status, ["reserved", "succeeded", "tracking_failed"]),
      ),
    )
    .returning({ id: schema.usageEvents.id });

  if (!claimedEvent) {
    const current = await findUsageEvent(database, event.operationKey);
    if (current?.status === "tracking_succeeded") {
      return ok({
        amountUsd: positiveNumber(Number(current.amountUsd ?? 0)),
        status: "already_settled",
      });
    }
    if (current?.status === "settlement_unknown" && !current.autumnTrackError) {
      return err({
        code: "ai_credit_settlement_in_progress",
        operationKey: event.operationKey,
      });
    }
    return err({
      code: "ai_credit_tracking_failed",
      operationKey: event.operationKey,
      message: current?.autumnTrackError ?? "AI credit settlement could not be claimed",
      settlementUnknown: current?.status === "settlement_unknown",
    });
  }

  try {
    const autumn = apiKey ? createAutumnClient(apiKey) : null;
    const trackTokens =
      input.dependencies?.trackTokens ??
      (async (params: Parameters<NonNullable<ManagedAiCreditDependencies["trackTokens"]>>[0]) => {
        if (!autumn) throw new Error("Autumn is not configured");
        return autumn.trackTokens(params);
      });
    const tracked = await trackTokens({
      customerId: event.organizationId,
      featureId: usageFeatureIds.aiTokens,
      modelId: input.modelId,
      inputTokens: input.tokenUsage.inputTokens,
      outputTokens: input.tokenUsage.outputTokens,
      cacheReadTokens: input.tokenUsage.cacheReadTokens,
      cacheWriteTokens: input.tokenUsage.cacheWriteTokens,
      reasoningTokens: input.tokenUsage.reasoningTokens,
      audioInputTokens: input.tokenUsage.audioInputTokens,
      audioOutputTokens: input.tokenUsage.audioOutputTokens,
      overageBehavior: event.dimensions.overage_allowed === true ? "overflow" : "cap",
      properties: {
        operation_key: event.operationKey,
        source: event.source,
        pricing_version: event.dimensions.pricing_version,
        job_id: event.jobId,
        interaction_id: event.interactionId,
        provider_generation_id: input.providerGenerationId,
      },
    });
    const amountUsd = positiveNumber(tracked.value);

    await database
      .update(schema.usageEvents)
      .set({
        status: "tracking_succeeded",
        amountUsd: normalizeUsdAmount(amountUsd),
        autumnTrackedAt: new Date(),
        autumnTrackError: null,
      })
      .where(eq(schema.usageEvents.id, event.id));

    return ok({ amountUsd, status: "settled" });
  } catch (error) {
    const message = safeErrorMessage(error);
    await database
      .update(schema.usageEvents)
      .set({
        status: "settlement_unknown",
        autumnTrackError: message,
      })
      .where(eq(schema.usageEvents.id, event.id));
    return err({
      code: "ai_credit_tracking_failed",
      operationKey: event.operationKey,
      message,
      settlementUnknown: true,
    });
  }
}

export async function releaseManagedAiCredit(input: {
  db?: DatabaseClient;
  reservation: ManagedAiCreditReservation;
  reason?: string;
}): Promise<Result<void, ManagedAiCreditError>> {
  const database = input.db ?? db;
  const [event] = await database
    .update(schema.usageEvents)
    .set({
      status: "rejected",
      amountUsd: normalizeUsdAmount(0),
      autumnTrackError: input.reason?.slice(0, 500) ?? null,
    })
    .where(eq(schema.usageEvents.operationKey, input.reservation.operationKey))
    .returning({ id: schema.usageEvents.id });

  if (!event) {
    return err({
      code: "ai_credit_usage_not_found",
      operationKey: input.reservation.operationKey,
    });
  }

  return ok(undefined);
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
