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

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import {
  releaseManagedAiCredit,
  reserveManagedAiCredit,
  settleManagedAiCredit,
} from "@/lib/billing/managed-ai-credit";

const authFixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await authFixture.cleanup();
});

async function createOrganization() {
  const { organization } = await authFixture.createLocalWorkosIdentity();
  return organization;
}

async function getUsageEvent(operationKey: string) {
  const [event] = await db
    .select()
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, operationKey))
    .limit(1);
  return event;
}

function allowedCheck(remaining = 10) {
  return vi.fn(async () => ({
    allowed: true,
    balance: {
      remaining,
      unlimited: false,
      overageAllowed: false,
    },
  }));
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("managed AI credit", () => {
  it("reserves estimated USD and includes outstanding reservations in the next check", async () => {
    const organization = await createOrganization();
    const check = allowedCheck(1);
    const firstKey = `ai-credit:${randomUUID()}`;
    const secondKey = `ai-credit:${randomUUID()}`;

    const first = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey: firstKey,
      source: "chat_agent_turn",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.75,
      mode: "enforced",
      dependencies: { check },
    });
    const second = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey: secondKey,
      source: "chat_agent_turn",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.75,
      mode: "enforced",
      dependencies: { check },
    });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      ok: false,
      error: {
        code: "ai_credit_insufficient",
        requiredAmountUsd: 0.75,
        remainingAmountUsd: 0.25,
      },
    });
    expect(check).toHaveBeenNthCalledWith(2, expect.objectContaining({ requiredBalance: 1.5 }));
    await expect(getUsageEvent(firstKey)).resolves.toMatchObject({
      estimatedAmountUsd: "0.750000000",
      credentialSource: "gateway",
      reservationKey: firstKey,
      status: "reserved",
    });
  });

  it("settles exclusive token pools and stores Autumn's USD charge", async () => {
    const organization = await createOrganization();
    const operationKey = `ai-credit:${randomUUID()}`;
    const reservation = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "chat_agent_turn",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 1,
      mode: "enforced",
      dependencies: { check: allowedCheck() },
    });
    if (!reservation.ok) throw new Error(reservation.error.code);
    const trackTokens = vi.fn(async () => ({ value: 0.012345678 }));

    const settled = await settleManagedAiCredit({
      reservation: reservation.value,
      modelId: "openai/gpt-5.6-luna",
      providerGenerationId: "gen_123",
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 40,
        cacheWriteTokens: 10,
        reasoningTokens: 5,
        totalTokens: 175,
      },
      dependencies: { trackTokens },
    });

    expect(settled).toEqual({
      ok: true,
      value: { amountUsd: 0.012345678, status: "settled" },
    });
    expect(trackTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: organization.id,
        featureId: "ai_tokens",
        modelId: "openai/gpt-5.6-luna",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 40,
        cacheWriteTokens: 10,
        reasoningTokens: 5,
        overageBehavior: "cap",
      }),
    );
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      amountUsd: "0.012345678",
      providerGenerationId: "gen_123",
      status: "tracking_succeeded",
      dimensions: expect.objectContaining({
        input_tokens: 100,
        cache_read_tokens: 40,
        reasoning_tokens: 5,
      }),
    });
  });

  it("records BYOK usage at zero without calling Autumn", async () => {
    const organization = await createOrganization();
    const operationKey = `ai-credit:${randomUUID()}`;
    const check = allowedCheck();
    const trackTokens = vi.fn();
    const reservation = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "chat_agent_turn",
      modelId: "claude-custom",
      credentialSource: "byok",
      estimatedAmountUsd: 0,
      mode: "enforced",
      dependencies: { check },
    });
    if (!reservation.ok) throw new Error(reservation.error.code);

    const settled = await settleManagedAiCredit({
      reservation: reservation.value,
      modelId: "claude-custom",
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
      dependencies: { trackTokens },
    });

    expect(settled).toEqual({
      ok: true,
      value: { amountUsd: 0, status: "settled" },
    });
    expect(check).not.toHaveBeenCalled();
    expect(trackTokens).not.toHaveBeenCalled();
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      amountUsd: "0.000000000",
      credentialSource: "byok",
      status: "tracking_succeeded",
    });
  });

  it("rejects a duplicate operation after the original reservation has settled", async () => {
    const organization = await createOrganization();
    const operationKey = `ai-credit:${randomUUID()}`;
    const first = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "chat_agent_turn",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.5,
      mode: "shadow",
    });
    if (!first.ok) throw new Error(first.error.code);
    await settleManagedAiCredit({
      reservation: first.value,
      modelId: "openai/gpt-5.6-luna",
      tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      shadowAmountUsd: 0.1,
    });

    const duplicate = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "chat_agent_turn",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.5,
      mode: "shadow",
    });

    expect(duplicate).toMatchObject({
      ok: false,
      error: {
        code: "ai_credit_operation_already_exists",
        operationKey,
        status: "tracking_succeeded",
      },
    });
  });

  it("allows only one concurrent caller to dispatch an Autumn settlement", async () => {
    const organization = await createOrganization();
    const operationKey = `ai-credit:${randomUUID()}`;
    const reservation = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "chat_agent_turn",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.5,
      mode: "enforced",
      dependencies: { check: allowedCheck() },
    });
    if (!reservation.ok) throw new Error(reservation.error.code);
    const deferred = createDeferred({ value: 0.1 });
    const trackTokens = vi.fn(() => deferred.promise);
    const settlementInput = {
      reservation: reservation.value,
      modelId: "openai/gpt-5.6-luna",
      tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      dependencies: { trackTokens },
    };

    const first = settleManagedAiCredit(settlementInput);
    await vi.waitFor(() => expect(trackTokens).toHaveBeenCalledOnce());
    const second = await settleManagedAiCredit(settlementInput);
    deferred.resolve({ value: 0.1 });

    await expect(first).resolves.toMatchObject({
      ok: true,
      value: { status: "settled" },
    });
    expect(second).toMatchObject({
      ok: false,
      error: {
        code: "ai_credit_settlement_in_progress",
        operationKey,
      },
    });
    expect(trackTokens).toHaveBeenCalledOnce();
  });

  it("marks ambiguous Autumn failures without retrying", async () => {
    const organization = await createOrganization();
    const operationKey = `ai-credit:${randomUUID()}`;
    const reservation = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "image_localization",
      modelId: "custom/hyperlocalise-gpt-image-2",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.2,
      mode: "enforced",
      dependencies: { check: allowedCheck() },
    });
    if (!reservation.ok) throw new Error(reservation.error.code);
    const trackTokens = vi.fn(async () => {
      throw new Error("connection reset");
    });

    const settled = await settleManagedAiCredit({
      reservation: reservation.value,
      modelId: "custom/hyperlocalise-gpt-image-2",
      tokenUsage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 },
      dependencies: { trackTokens },
    });

    expect(settled).toMatchObject({
      ok: false,
      error: {
        code: "ai_credit_tracking_failed",
        settlementUnknown: true,
      },
    });
    const repeated = await settleManagedAiCredit({
      reservation: reservation.value,
      modelId: "custom/hyperlocalise-gpt-image-2",
      tokenUsage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 },
      dependencies: { trackTokens },
    });
    expect(repeated).toMatchObject({
      ok: false,
      error: {
        code: "ai_credit_tracking_failed",
        settlementUnknown: true,
      },
    });
    expect(trackTokens).toHaveBeenCalledOnce();
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      status: "settlement_unknown",
      autumnTrackError: "connection reset",
    });
  });

  it("releases local reservations when provider work fails before usage", async () => {
    const organization = await createOrganization();
    const operationKey = `ai-credit:${randomUUID()}`;
    const reservation = await reserveManagedAiCredit({
      organizationId: organization.id,
      operationKey,
      source: "video_localization",
      modelId: "custom/hyperlocalise-seedance-2-5",
      credentialSource: "gateway",
      estimatedAmountUsd: 2,
      mode: "shadow",
    });
    if (!reservation.ok) throw new Error(reservation.error.code);

    const released = await releaseManagedAiCredit({
      reservation: reservation.value,
      reason: "video_generation_failed",
    });

    expect(released).toEqual({ ok: true, value: undefined });
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      amountUsd: "0.000000000",
      status: "rejected",
      autumnTrackError: "video_generation_failed",
    });
  });
});
