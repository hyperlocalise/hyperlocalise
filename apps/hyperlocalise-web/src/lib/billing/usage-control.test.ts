/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import {
  completeAndTrackBillableUsage,
  markUsageEventSucceededByOperationKey,
  reserveUsageEvent,
  trackAiCreditUsageInAutumn,
  trackUsageEventInAutumnByOperationKey,
  usageFeatureIds,
} from "./usage-control";

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

async function reservedUsageEvent(operationKey = `usage_${randomUUID()}`) {
  const organization = await createOrganization();
  const eventResult = await reserveUsageEvent({
    organizationId: organization.id,
    featureId: usageFeatureIds.translationJobs,
    operationKey,
    source: "translation_job_create",
    quantity: 1,
  });
  if (isErr(eventResult)) {
    throw new Error(eventResult.error.code);
  }

  return { event: eventResult.value, operationKey, organization };
}

async function getUsageEvent(operationKey: string) {
  const [event] = await db
    .select()
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, operationKey))
    .limit(1);

  return event;
}

describe("usage-control", () => {
  it("reserves usage events idempotently by operation key", async () => {
    const organization = await createOrganization();
    const operationKey = `usage_${randomUUID()}`;

    const first = await reserveUsageEvent({
      organizationId: organization.id,
      featureId: usageFeatureIds.translationJobs,
      operationKey,
      source: "translation_job_create",
      quantity: 1,
    });
    const second = await reserveUsageEvent({
      organizationId: organization.id,
      featureId: usageFeatureIds.translationJobs,
      operationKey,
      source: "translation_job_create",
      quantity: 1,
    });

    const rows = await db
      .select({ id: schema.usageEvents.id })
      .from(schema.usageEvents)
      .where(eq(schema.usageEvents.operationKey, operationKey));

    if (isErr(first) || isErr(second)) {
      throw new Error("Expected usage event reservations to succeed");
    }

    expect(second.value.id).toBe(first.value.id);
    expect(rows).toHaveLength(1);
  });

  it("returns an error when marking a missing usage event succeeded", async () => {
    const operationKey = `missing_${randomUUID()}`;
    const result = await markUsageEventSucceededByOperationKey({ operationKey });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "usage_event_not_found",
        operationKey,
      },
    });
  });

  it("posts succeeded usage events to Autumn before marking tracking succeeded", async () => {
    const { operationKey, organization } = await reservedUsageEvent();
    const markResult = await markUsageEventSucceededByOperationKey({ operationKey });
    expect(isErr(markResult)).toBe(false);

    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;

    const trackResult = await trackUsageEventInAutumnByOperationKey({
      operationKey,
      autumnApiKey: "am_sk_test",
      fetchFn,
    });
    expect(trackResult).toMatchObject({
      ok: true,
      value: { status: "tracking_succeeded" },
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [requestUrl, requestInit] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    expect(requestUrl).toBe("https://api.useautumn.com/v1/balances.track");
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer am_sk_test",
        "Content-Type": "application/json",
        "x-api-version": "2.2.0",
      },
    });
    const requestBody = requestInit?.body;
    if (typeof requestBody !== "string") {
      throw new Error("Expected JSON string request body");
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      customer_id: organization.id,
      feature_id: "translation_jobs",
      value: 1,
      idempotency_key: operationKey,
      properties: {
        operation_key: operationKey,
        source: "translation_job_create",
      },
    });

    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      status: "tracking_succeeded",
      autumnTrackError: null,
      autumnTrackedAt: expect.any(Date),
    });
  });

  it("tracks reserved feature balances by feature_id and keeps event names in properties", async () => {
    const { operationKey, organization } = await reservedUsageEvent();
    const markResult = await markUsageEventSucceededByOperationKey({
      operationKey,
      quantity: 1,
      dimensions: { autumn_event_name: "translation_job.completed" },
    });
    expect(isErr(markResult)).toBe(false);

    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;

    const trackResult = await trackUsageEventInAutumnByOperationKey({
      operationKey,
      autumnApiKey: "am_sk_test",
      fetchFn,
    });
    expect(trackResult).toMatchObject({
      ok: true,
      value: { status: "tracking_succeeded" },
    });

    const [, requestInit] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    const requestBody = requestInit?.body;
    if (typeof requestBody !== "string") {
      throw new Error("Expected JSON string request body");
    }
    const parsedBody = JSON.parse(requestBody);
    expect(parsedBody).toMatchObject({
      customer_id: organization.id,
      feature_id: "translation_jobs",
      value: 1,
      idempotency_key: operationKey,
      properties: {
        event_name: "translation_job.completed",
      },
    });
    expect(parsedBody).not.toHaveProperty("event_name");
  });

  it("tracks AI credit usage against ai_tokens with a derived operation key", async () => {
    const { operationKey, organization } = await reservedUsageEvent();
    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;

    const trackResult = await trackAiCreditUsageInAutumn({
      organizationId: organization.id,
      parentOperationKey: operationKey,
      tokenUsage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 },
      source: "translation_job_complete",
      autumnApiKey: "am_sk_test",
      fetchFn,
    });

    expect(trackResult).toMatchObject({
      ok: true,
      value: { status: "tracking_succeeded" },
    });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, requestInit] = vi.mocked(fetchFn).mock.calls[0] ?? [];
    const requestBody = requestInit?.body;
    if (typeof requestBody !== "string") {
      throw new Error("Expected JSON string request body");
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      customer_id: organization.id,
      feature_id: "ai_tokens",
      value: 100,
      idempotency_key: `${operationKey}:ai_tokens`,
    });
  });

  it("marks tracking failed when Autumn rejects the usage event", async () => {
    const { operationKey } = await reservedUsageEvent();
    const markResult = await markUsageEventSucceededByOperationKey({ operationKey });
    expect(isErr(markResult)).toBe(false);

    const fetchFn = vi.fn(
      async () => new Response("bad", { status: 500 }),
    ) as unknown as typeof fetch;

    const trackResult = await trackUsageEventInAutumnByOperationKey({
      operationKey,
      autumnApiKey: "am_sk_test",
      fetchFn,
    });

    expect(trackResult).toMatchObject({
      ok: false,
      error: {
        code: "autumn_usage_tracking_failed",
        operationKey,
        message: "Autumn usage tracking failed with HTTP 500",
        httpStatus: 500,
      },
    });

    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      status: "tracking_failed",
      autumnTrackError: "Autumn usage tracking failed with HTTP 500",
    });
  });

  it("returns AI credit tracking failure after the feature meter succeeds", async () => {
    const { operationKey, organization } = await reservedUsageEvent();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("bad", { status: 500 })) as unknown as typeof fetch;

    const trackResult = await completeAndTrackBillableUsage({
      organizationId: organization.id,
      operationKey,
      autumnEventName: "translation_job.completed",
      unit: "job",
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      autumnApiKey: "am_sk_test",
      fetchFn,
    });

    expect(trackResult).toMatchObject({
      ok: false,
      error: {
        code: "autumn_usage_tracking_failed",
        operationKey: `${operationKey}:ai_tokens`,
      },
    });
    await expect(getUsageEvent(operationKey)).resolves.toMatchObject({
      status: "tracking_succeeded",
    });
    await expect(getUsageEvent(`${operationKey}:ai_tokens`)).resolves.toMatchObject({
      status: "tracking_failed",
    });
  });

  it("does not track reserved events before they are marked succeeded", async () => {
    const { operationKey } = await reservedUsageEvent();
    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;

    const trackResult = await trackUsageEventInAutumnByOperationKey({
      operationKey,
      autumnApiKey: "am_sk_test",
      fetchFn,
    });

    expect(trackResult).toMatchObject({
      ok: false,
      error: {
        code: "usage_event_not_trackable",
        operationKey,
        status: "reserved",
      },
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
