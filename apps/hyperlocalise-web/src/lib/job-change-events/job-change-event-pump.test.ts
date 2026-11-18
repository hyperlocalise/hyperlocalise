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
import { openWaitingTasks } from "@/lib/projects/jobs/waiting-task";

import {
  dispatchJobChangeEvents,
  JOB_CHANGE_EVENT_MAX_CLAIMS,
  JOB_CHANGE_EVENT_RETENTION_MS,
  pruneJobChangeEvents,
  runJobChangeEventPump,
} from "./job-change-event-pump";
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

// Postgres stamps next_attempt_at with microsecond now(). A millisecond JS
// clock can still read as just before it, so claim past the queue time.
function afterQueueTime() {
  return new Date(Date.now() + 1_000);
}

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

  it("marks events abandoned after repeated fan-out failures", async () => {
    const organizationId = await insertOrganization();
    const jobId = await insertJob(organizationId);
    const enqueueWebhooks = async () => {
      throw new Error("fan-out failed");
    };

    let now = new Date();
    for (let attempt = 1; attempt <= JOB_CHANGE_EVENT_MAX_CLAIMS; attempt += 1) {
      const result = await dispatchJobChangeEvents({ organizationId, now, enqueueWebhooks });
      expect(result.claimed).toBeGreaterThan(0);
      if (attempt < JOB_CHANGE_EVENT_MAX_CLAIMS) {
        expect(result).toMatchObject({ failed: result.claimed, abandoned: 0 });
        now = new Date(now.getTime() + 7 * 60_000);
      } else {
        expect(result.abandoned).toBe(result.claimed);
      }
    }

    expect((await listEvents(jobId)).every((event) => event.abandonedAt !== null)).toBe(true);
    expect((await dispatchJobChangeEvents({ organizationId, enqueueWebhooks })).claimed).toBe(0);
  });
});

describe("tasks that come after another job", () => {
  async function insertTask(organizationId: string, afterJobId: string | null) {
    const jobId = `job_${randomUUID()}`;
    await insertJobs(db, {
      values: {
        id: jobId,
        organizationId,
        kind: "proofread",
        status: afterJobId ? "queued" : "waiting_for_review",
        afterJobId,
        inputPayload: {},
      },
    });
    return jobId;
  }
  async function statusOf(jobId: string) {
    const [job] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId));
    return job?.status;
  }
  const finish = (jobId: string, status: "succeeded" | "cancelled" | "failed") =>
    updateJobs(db, { set: { status }, where: eq(schema.jobs.id, jobId) });

  it("opens one step at a time as each earlier task is marked done", async () => {
    const organizationId = await insertOrganization();
    const postEdit = await insertTask(organizationId, null);
    const proofread = await insertTask(organizationId, postEdit);
    const signOff = await insertTask(organizationId, proofread);

    expect(await openWaitingTasks(db, { organizationId })).toBe(0);
    expect(await statusOf(proofread)).toBe("queued");

    await finish(postEdit, "succeeded");
    expect(await openWaitingTasks(db, { organizationId })).toBe(1);
    expect(await statusOf(proofread)).toBe("waiting_for_review");
    // The opened task is not finished yet, so the task after it still waits.
    expect(await statusOf(signOff)).toBe("queued");
    // Opening is a status change of its own, for webhooks and Job changed workflows.
    expect(
      (await listEvents(proofread)).map((event) => [event.type, event.fromStatus, event.toStatus]),
    ).toEqual([
      ["job.created", null, "queued"],
      ["job.status_changed", "queued", "waiting_for_review"],
    ]);

    expect(await openWaitingTasks(db, { organizationId })).toBe(0);
    await finish(proofread, "succeeded");
    expect(await openWaitingTasks(db, { organizationId })).toBe(1);
    expect(await statusOf(signOff)).toBe("waiting_for_review");
  });

  it("opens after a cancelled step or a finished AI job, waits on a failed one, and leaves other queued jobs alone", async () => {
    const organizationId = await insertOrganization();
    const cancelled = await insertTask(organizationId, null);
    const afterCancelled = await insertTask(organizationId, cancelled);
    const aiJob = await insertJob(organizationId);
    const afterAiJob = await insertTask(organizationId, aiJob);
    const failed = await insertJob(organizationId);
    const afterFailed = await insertTask(organizationId, failed);
    const unrelated = await insertJob(organizationId);

    await finish(cancelled, "cancelled");
    await finish(aiJob, "succeeded");
    await finish(failed, "failed");
    expect(await openWaitingTasks(db, { organizationId })).toBe(2);

    expect(await statusOf(afterCancelled)).toBe("waiting_for_review");
    expect(await statusOf(afterAiJob)).toBe("waiting_for_review");
    expect(await statusOf(afterFailed)).toBe("queued");
    expect(await statusOf(unrelated)).toBe("queued");

    // A waiting task that was cancelled meanwhile stays cancelled.
    await finish(afterFailed, "cancelled");
    await finish(failed, "succeeded");
    expect(await openWaitingTasks(db, { organizationId })).toBe(0);
    expect(await statusOf(afterFailed)).toBe("cancelled");
  });

  it("opens waiting tasks in a pump tick and sends their change in the same tick", async () => {
    const organizationId = await insertOrganization();
    const { endpoint } = await createEndpoint(organizationId, ["job.status_changed"]);
    const postEdit = await insertTask(organizationId, null);
    const proofread = await insertTask(organizationId, postEdit);
    await finish(postEdit, "succeeded");

    const { requests, sender } = recordingSender(204);
    const tick = await runJobChangeEventPump({ organizationId, now: afterQueueTime(), sender });

    expect(tick.openedTasks).toBe(1);
    expect(await statusOf(proofread)).toBe("waiting_for_review");
    const sent = requests
      .filter((request) => request.url === endpoint.url)
      .map((request) => JSON.parse(request.body) as { data: { job: Record<string, unknown> } })
      .map((body) => [body.data.job.id, body.data.job.previousStatus, body.data.job.status]);
    expect(sent).toContainEqual([proofread, "queued", "waiting_for_review"]);
  });
});

describe("deliverDueWebhooks", () => {
  it("sends a signed body and records success", async () => {
    const organizationId = await insertOrganization();
    const { secret, endpoint } = await createEndpoint(organizationId);
    await insertJob(organizationId);
    await dispatchJobChangeEvents({ organizationId });

    const { requests, sender } = recordingSender(204);
    const result = await deliverDueWebhooks({ organizationId, sender, now: afterQueueTime() });
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

    let now = afterQueueTime();
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

    await deliverDueWebhooks({
      organizationId,
      sender: recordingSender(503).sender,
      now: afterQueueTime(),
    });

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

describe("pruneJobChangeEvents", () => {
  it("deletes dispatched events and finished deliveries past the retention window", async () => {
    const organizationId = await insertOrganization();
    const { endpoint } = await createEndpoint(organizationId);
    const now = new Date("2026-11-13T00:00:00.000Z");
    const stale = new Date(now.getTime() - JOB_CHANGE_EVENT_RETENTION_MS - 60_000);
    const recent = new Date(now.getTime() - 24 * 60 * 60_000);

    await db.insert(schema.jobChangeEvents).values([
      {
        organizationId,
        jobId: "job_stale_dispatched",
        kind: "translation",
        type: "job.created",
        toStatus: "queued",
        occurredAt: stale,
        dispatchedAt: stale,
      },
      {
        organizationId,
        jobId: "job_recent_dispatched",
        kind: "translation",
        type: "job.created",
        toStatus: "queued",
        occurredAt: recent,
        dispatchedAt: recent,
      },
      {
        organizationId,
        jobId: "job_stale_pending",
        kind: "translation",
        type: "job.created",
        toStatus: "queued",
        occurredAt: stale,
      },
    ]);

    await db.insert(schema.webhookDeliveries).values([
      {
        organizationId,
        endpointId: endpoint.id,
        eventType: "job.created",
        payload: { type: "job.created" },
        status: "succeeded",
        completedAt: stale,
        createdAt: stale,
      },
      {
        organizationId,
        endpointId: endpoint.id,
        eventType: "job.status_changed",
        payload: { type: "job.status_changed" },
        status: "pending",
        createdAt: stale,
      },
      {
        organizationId,
        endpointId: endpoint.id,
        eventType: "job.details_changed",
        payload: { type: "job.details_changed" },
        status: "failed",
        completedAt: recent,
        createdAt: recent,
      },
    ]);

    await expect(pruneJobChangeEvents(now)).resolves.toEqual({ events: 1, deliveries: 1 });

    const events = await db
      .select({ jobId: schema.jobChangeEvents.jobId })
      .from(schema.jobChangeEvents)
      .where(eq(schema.jobChangeEvents.organizationId, organizationId));
    expect(events.map((event) => event.jobId).sort()).toEqual([
      "job_recent_dispatched",
      "job_stale_pending",
    ]);

    const deliveries = await db
      .select({ eventType: schema.webhookDeliveries.eventType })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(deliveries.map((delivery) => delivery.eventType).sort()).toEqual([
      "job.details_changed",
      "job.status_changed",
    ]);
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
