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

import {
  formatManagedAiCreditError,
  getManagedAiCreditReservation,
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
import { err, ok, type Result } from "@/lib/primitives/result/results";

export function sandboxTranslationAiCreditOperationKey(jobId: string) {
  return `job:${jobId}:translation_jobs:ai_tokens`;
}

export async function reserveSandboxTranslationAiCredit(input: {
  organizationId: string;
  jobId: string;
  source: string;
  modelId: string;
  credentialSource: AiCreditCredentialSource;
  surface?: string;
}): Promise<Result<ManagedAiCreditReservation | null, ManagedAiCreditError>> {
  const pricingConfig = getManagedAiPricingConfig();
  if (pricingConfig.mode === "legacy") {
    return ok(null);
  }

  const operationKey = sandboxTranslationAiCreditOperationKey(input.jobId);
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
      surface: input.surface ?? input.source,
    });
  }

  return reserveManagedAiCredit({
    organizationId: input.organizationId,
    operationKey,
    source: input.source,
    modelId: input.modelId,
    credentialSource: input.credentialSource,
    estimatedAmountUsd,
    jobId: input.jobId,
    mode: pricingConfig.mode,
    dimensions: {
      surface: input.surface ?? "sandbox_translation",
    },
  });
}

export async function releaseSandboxTranslationAiCredit(input: {
  jobId: string;
  reason: string;
}): Promise<void> {
  const reservation = await getManagedAiCreditReservation({
    operationKey: sandboxTranslationAiCreditOperationKey(input.jobId),
  });
  if (!reservation) {
    return;
  }

  const released = await releaseManagedAiCredit({
    reservation,
    reason: input.reason,
  });
  if (!released.ok) {
    console.warn("[sandbox-translation-credit] failed to release reservation", {
      jobId: input.jobId,
      error: formatManagedAiCreditError(released.error),
    });
  }
}
