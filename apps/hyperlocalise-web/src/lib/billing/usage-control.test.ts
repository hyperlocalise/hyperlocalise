import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import {
  markUsageEventSucceededByOperationKey,
  reserveUsageEvent,
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

  it("tracks usage events by Autumn event name when configured", async () => {
    const { operationKey, organization } = await reservedUsageEvent();
    const markResult = await markUsageEventSucceededByOperationKey({
      operationKey,
      quantity: 123,
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
      event_name: "translation_job.completed",
      value: 123,
      idempotency_key: operationKey,
    });
    expect(parsedBody).not.toHaveProperty("feature_id");
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
