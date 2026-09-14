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
import "dotenv/config";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getManagedAiCreditReservationMock = vi.fn();
const reserveManagedAiCreditMock = vi.fn();
const releaseManagedAiCreditMock = vi.fn();
const retainManagedAiCreditForUnmeteredSuccessMock = vi.fn();
const getManagedAiPricingConfigMock = vi.fn();

vi.mock("@/lib/billing/managed-ai-credit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/managed-ai-credit")>();
  return {
    ...actual,
    formatManagedAiCreditError: (error: { code: string }) => error.code,
    getManagedAiCreditReservation: (...args: unknown[]) =>
      getManagedAiCreditReservationMock(...args),
    reserveManagedAiCredit: (...args: unknown[]) => reserveManagedAiCreditMock(...args),
    releaseManagedAiCredit: (...args: unknown[]) => releaseManagedAiCreditMock(...args),
    retainManagedAiCreditForUnmeteredSuccess: (...args: unknown[]) =>
      retainManagedAiCreditForUnmeteredSuccessMock(...args),
  };
});

vi.mock("@/lib/billing/managed-ai-pricing", () => ({
  getManagedAiPricingConfig: () => getManagedAiPricingConfigMock(),
  managedAiReservationAmountUsd: () => 0.75,
}));

import { ok } from "@/lib/primitives/result/results";
import {
  releaseSandboxTranslationAiCredit,
  reserveSandboxTranslationAiCredit,
  retainSandboxTranslationAiCreditForUnmeteredSuccess,
  sandboxTranslationAiCreditOperationKey,
} from "@/lib/billing/sandbox-translation-credit";

describe("sandbox translation AI credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getManagedAiPricingConfigMock.mockReturnValue({ mode: "legacy" });
  });

  it("does not reserve in legacy metering mode", async () => {
    await expect(
      reserveSandboxTranslationAiCredit({
        organizationId: "org_1",
        jobId: "job_1",
        source: "translation_job_complete",
        modelId: "openai/gpt-5.6-luna",
        credentialSource: "gateway",
      }),
    ).resolves.toEqual(ok(null));
    expect(reserveManagedAiCreditMock).not.toHaveBeenCalled();
  });

  it("reuses an outstanding reservation instead of creating a second one", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({ mode: "enforced" });
    const existing = {
      operationKey: sandboxTranslationAiCreditOperationKey("job_1"),
      status: "reserved" as const,
      mode: "enforced" as const,
      credentialSource: "gateway" as const,
      estimatedAmountUsd: 0.75,
    };
    getManagedAiCreditReservationMock.mockResolvedValue(existing);

    await expect(
      reserveSandboxTranslationAiCredit({
        organizationId: "org_1",
        jobId: "job_1",
        source: "translation_job_complete",
        modelId: "openai/gpt-5.6-luna",
        credentialSource: "gateway",
      }),
    ).resolves.toEqual(ok(existing));
    expect(reserveManagedAiCreditMock).not.toHaveBeenCalled();
  });

  it("rejects reuse of a released reservation so balance is checked again", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({ mode: "enforced" });
    getManagedAiCreditReservationMock.mockResolvedValue({
      operationKey: sandboxTranslationAiCreditOperationKey("job_1"),
      status: "rejected",
      mode: "enforced",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.75,
    });

    await expect(
      reserveSandboxTranslationAiCredit({
        organizationId: "org_1",
        jobId: "job_1",
        source: "translation_job_complete",
        modelId: "openai/gpt-5.6-luna",
        credentialSource: "gateway",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "ai_credit_operation_already_exists",
        operationKey: "job:job_1:translation_jobs:ai_tokens",
        status: "rejected",
      },
    });
    expect(reserveManagedAiCreditMock).not.toHaveBeenCalled();
  });

  it("reserves estimated chat credit before a managed sandbox run", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({ mode: "enforced" });
    getManagedAiCreditReservationMock.mockResolvedValue(null);
    reserveManagedAiCreditMock.mockResolvedValue(ok({ status: "reserved" }));

    await reserveSandboxTranslationAiCredit({
      organizationId: "org_1",
      jobId: "job_1",
      source: "translation_job_complete",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      surface: "file_translation",
    });

    expect(reserveManagedAiCreditMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      operationKey: "job:job_1:translation_jobs:ai_tokens",
      source: "translation_job_complete",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.75,
      jobId: "job_1",
      mode: "enforced",
      dimensions: { surface: "file_translation" },
    });
  });

  it("releases only when a reservation exists", async () => {
    getManagedAiCreditReservationMock.mockResolvedValueOnce(null);
    await releaseSandboxTranslationAiCredit({
      jobId: "job_1",
      reason: "file_translation_failed",
    });
    expect(releaseManagedAiCreditMock).not.toHaveBeenCalled();

    const reservation = { operationKey: "job:job_1:translation_jobs:ai_tokens" };
    getManagedAiCreditReservationMock.mockResolvedValueOnce(reservation);
    releaseManagedAiCreditMock.mockResolvedValue(ok(undefined));
    await releaseSandboxTranslationAiCredit({
      jobId: "job_1",
      reason: "file_translation_failed",
    });
    expect(releaseManagedAiCreditMock).toHaveBeenCalledWith({
      reservation,
      reason: "file_translation_failed",
    });
  });

  it("retains credit after success when CLI usage is missing", async () => {
    const reservation = {
      operationKey: "job:job_1:translation_jobs:ai_tokens",
      mode: "enforced",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.75,
      status: "reserved",
    };
    getManagedAiCreditReservationMock.mockResolvedValueOnce(reservation);
    retainManagedAiCreditForUnmeteredSuccessMock.mockResolvedValue(ok(undefined));

    await retainSandboxTranslationAiCreditForUnmeteredSuccess({
      jobId: "job_1",
      reason: "no_cli_token_usage",
    });

    expect(retainManagedAiCreditForUnmeteredSuccessMock).toHaveBeenCalledWith({
      reservation,
      reason: "no_cli_token_usage",
    });
  });
});
