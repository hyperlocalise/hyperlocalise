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

import { and, asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import {
  WEBHOOK_AUTO_DISABLE_AFTER_FAILURES,
  WEBHOOK_MAX_ATTEMPTS,
  deliverDueWebhooks,
  type WebhookSender,
} from "@/lib/outbound-webhooks/webhook-deliveries";
import {
  createWebhookEndpoint,
  sendWebhookTestEvent,
  updateWebhookEndpoint,
} from "@/lib/outbound-webhooks/webhook-endpoints";
import { verifyWebhookSignature } from "@/lib/outbound-webhooks/webhook-signing";
import { isErr } from "@/lib/primitives/result/results";

import { dispatchJobChangeEvents } from "./job-change-event-pump";
import { insertJobs, updateJobs } from "./job-writes";

const organizationIds: string[] = [];

afterEach(async () => {
  for (const organizationId of organizationIds.splice(0)) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
});

async function insertOrganization() {
  const organizationId = randomUUID();
  organizationIds.push(organizationId);
  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `job-change-${organizationId.slice(0, 8)}`,
    name: "Job Change Events Test Org",
  });
  return organizationId;
}

async function insertJob(organizationId: string) {
  const jobId = `job_${randomUUID()}`;
  await insertJobs(db, {
    values: { id: jobId, organizationId, kind: "translation", status: "queued", inputPayload: {} },
  });
  return jobId;
}

function listEvents(jobId: string) {
  return db
    .select()
    .from(schema.jobChangeEvents)
    .where(eq(schema.jobChangeEvents.jobId, jobId))
    .orderBy(asc(schema.jobChangeEvents.occurredAt));
}

async function createEndpoint(
  organizationId: string,
  eventTypes: ("job.created" | "job.status_changed")[] = [],
) {
  const result = await createWebhookEndpoint({
    organizationId,
    userId: null,
    url: "https://hooks.example.com/hyperlocalise",
    eventTypes,
  });
  if (isErr(result)) {
    throw new Error(result.error.code);
  }
  return result.value;
}

type SentRequest = Parameters<WebhookSender>[0];

function recordingSender(status: number) {
  const requests: SentRequest[] = [];
  const sender: WebhookSender = async (request) => {
    requests.push(request);
    return status >= 200 && status < 300
      ? { ok: true, status }
      : { ok: false, status, error: `http_${status}` };
  };
  return { requests, sender };
}

describe("dispatchJobChangeEvents", () => {
  it("queues one delivery per matching endpoint and marks events dispatched", async () => {
    const organizationId = await insertOrganization();
    const all = await createEndpoint(organizationId);
    const statusOnly = await createEndpoint(organizationId, ["job.status_changed"]);
    const jobId = await insertJob(organizationId);
    await updateJobs(db, { set: { status: "failed" }, where: eq(schema.jobs.id, jobId) });

    const result = await dispatchJobChangeEvents({ organizationId });
    expect(result).toMatchObject({ claimed: 2, dispatched: 2, failed: 0, webhookDeliveries: 3 });

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(
      deliveries
        .map(
          (delivery) =>
            `${delivery.endpointId === all.endpoint.id ? "all" : "status"}:${delivery.eventType}`,
        )
        .sort(),
    ).toEqual(["all:job.created", "all:job.status_changed", "status:job.status_changed"]);
    expect(
      deliveries.find((delivery) => delivery.endpointId === statusOnly.endpoint.id)?.payload,
    ).toMatchObject({
      type: "job.status_changed",
      data: { job: { id: jobId, kind: "translation", status: "failed", previousStatus: "queued" } },
    });

    expect((await listEvents(jobId)).every((event) => event.dispatchedAt !== null)).toBe(true);
    // A second tick finds nothing left to do.
    expect((await dispatchJobChangeEvents({ organizationId })).claimed).toBe(0);
  });
});

describe("deliverDueWebhooks", () => {
  it("sends a signed body and records success", async () => {
    const organizationId = await insertOrganization();
    const { secret, endpoint } = await createEndpoint(organizationId);
    await insertJob(organizationId);
    await dispatchJobChangeEvents({ organizationId });

    const { requests, sender } = recordingSender(204);
    const result = await deliverDueWebhooks({ organizationId, sender });
    expect(result).toEqual({ attempted: 1, succeeded: 1, retrying: 0, failed: 0 });

    const [request] = requests;
    expect(request?.url).toBe(endpoint.url);
    expect(JSON.parse(request!.body)).toMatchObject({ type: "job.created" });
    expect(
      verifyWebhookSignature({
        secret,
        messageId: request!.headers["webhook-id"]!,
        timestampSeconds: Number(request!.headers["webhook-timestamp"]),
        body: request!.body,
        signatureHeader: request!.headers["webhook-signature"]!,
      }),
    ).toBe(true);

    const [delivery] = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(delivery).toMatchObject({
      status: "succeeded",
      attemptCount: 1,
      lastResponseStatus: 204,
    });
    expect(request!.headers["webhook-id"]).toBe(delivery!.id);
  });

  it("retries on failure, then gives up after the last attempt", async () => {
    const organizationId = await insertOrganization();
    await createEndpoint(organizationId);
    await insertJob(organizationId);
    await dispatchJobChangeEvents({ organizationId });
    const { sender } = recordingSender(500);

    let now = new Date();
    for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
      const result = await deliverDueWebhooks({ organizationId, sender, now });
      expect(result.attempted).toBe(1);
      const [delivery] = await db
        .select()
        .from(schema.webhookDeliveries)
        .where(eq(schema.webhookDeliveries.organizationId, organizationId));
      expect(delivery?.attemptCount).toBe(attempt);
      if (attempt < WEBHOOK_MAX_ATTEMPTS) {
        expect(delivery).toMatchObject({ status: "pending", lastError: "http_500" });
        expect(delivery!.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
        // Nothing is due before the retry time.
        expect((await deliverDueWebhooks({ organizationId, sender, now })).attempted).toBe(0);
        now = new Date(delivery!.nextAttemptAt.getTime() + 1);
      } else {
        expect(delivery?.status).toBe("failed");
      }
    }
  });

  it("switches an endpoint off after too many failures in a row", async () => {
    const organizationId = await insertOrganization();
    const { endpoint } = await createEndpoint(organizationId);
    await db
      .update(schema.webhookEndpoints)
      .set({ consecutiveFailures: WEBHOOK_AUTO_DISABLE_AFTER_FAILURES - 1 })
      .where(eq(schema.webhookEndpoints.id, endpoint.id));
    await insertJob(organizationId);
    await dispatchJobChangeEvents({ organizationId });

    await deliverDueWebhooks({ organizationId, sender: recordingSender(503).sender });

    const [row] = await db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, endpoint.id));
    expect(row?.disabledReason).toBe("too_many_failures");
    expect(row?.disabledAt).not.toBeNull();

    // A disabled endpoint gets no new deliveries.
    await insertJob(organizationId);
    expect((await dispatchJobChangeEvents({ organizationId })).webhookDeliveries).toBe(0);

    // Enabling it again resets the failure count.
    const enabled = await updateWebhookEndpoint({
      organizationId,
      endpointId: endpoint.id,
      enabled: true,
    });
    expect(isErr(enabled) ? null : enabled.value).toMatchObject({
      enabled: true,
      consecutiveFailures: 0,
    });
  });
});

describe("sendWebhookTestEvent", () => {
  it("sends once, never retries, and does not count against the endpoint", async () => {
    const organizationId = await insertOrganization();
    const { endpoint } = await createEndpoint(organizationId);

    const result = await sendWebhookTestEvent({
      organizationId,
      endpointId: endpoint.id,
      sender: recordingSender(500).sender,
    });
    expect(isErr(result) ? null : result.value).toMatchObject({
      eventType: "webhook.test",
      status: "failed",
      attemptCount: 1,
      lastResponseStatus: 500,
    });

    const [row] = await db
      .select()
      .from(schema.webhookEndpoints)
      .where(and(eq(schema.webhookEndpoints.id, endpoint.id)));
    expect(row?.consecutiveFailures).toBe(0);
    expect((await deliverDueWebhooks({ organizationId })).attempted).toBe(0);
  });

  it("rejects non-HTTPS and private URLs", async () => {
    const organizationId = await insertOrganization();
    for (const url of [
      "http://hooks.example.com",
      "https://127.0.0.1/hook",
      "https://localhost/x",
    ]) {
      const result = await createWebhookEndpoint({
        organizationId,
        userId: null,
        url,
        eventTypes: [],
      });
      expect(isErr(result) ? result.error.code : "ok").toBe("webhook_url_invalid");
    }
  });
});
