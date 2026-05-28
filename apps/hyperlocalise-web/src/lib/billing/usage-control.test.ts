import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
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
  const event = await reserveUsageEvent({
    organizationId: organization.id,
    featureId: usageFeatureIds.translationJobs,
    operationKey,
    source: "translation_job_create",
    quantity: 1,
  });

  return { event, operationKey, organization };
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

    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });

  it("throws when marking a missing usage event succeeded", async () => {
    await expect(
      markUsageEventSucceededByOperationKey({ operationKey: `missing_${randomUUID()}` }),
    ).rejects.toThrow("usage event not found");
  });

  it("posts succeeded usage events to Autumn before marking tracking succeeded", async () => {
    const { operationKey, organization } = await reservedUsageEvent();
    await markUsageEventSucceededByOperationKey({ operationKey });

    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;

    await trackUsageEventInAutumnByOperationKey({
      operationKey,
      autumnApiKey: "am_sk_test",
      fetchFn,
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
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
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

  it("marks tracking failed when Autumn rejects the usage event", async () => {
    const { operationKey } = await reservedUsageEvent();
    await markUsageEventSucceededByOperationKey({ operationKey });

    const fetchFn = vi.fn(
      async () => new Response("bad", { status: 500 }),
    ) as unknown as typeof fetch;

    await expect(
      trackUsageEventInAutumnByOperationKey({
        operationKey,
        autumnApiKey: "am_sk_test",
        fetchFn,
      }),
    ).rejects.toThrow("Autumn usage tracking failed with HTTP 500");

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

    await expect(
      trackUsageEventInAutumnByOperationKey({
        operationKey,
        autumnApiKey: "am_sk_test",
        fetchFn,
      }),
    ).rejects.toThrow("must be succeeded before tracking");

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
