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

import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { GO_SVC_SERVICE_TOKEN_HEADER } from "@/lib/go-svc/go-svc-service-token";
import type { LocalisationDeepAuditQueue } from "@/lib/workflow/types";

const fixture = createAuthTestFixture();

function serviceHeaders() {
  const password = env.WORKOS_COOKIE_PASSWORD;
  if (!password) {
    throw new Error("WORKOS_COOKIE_PASSWORD is required for internal deep audit route tests");
  }
  return {
    [GO_SVC_SERVICE_TOKEN_HEADER]: createHmac("sha256", password)
      .update("go-svc-research")
      .digest("hex"),
  };
}

async function seedRun() {
  const { organization } = await fixture.createLocalWorkosIdentity();
  const suffix = randomUUID().slice(0, 8);
  const [domain] = await db
    .insert(schema.linkedDomains)
    .values({
      organizationId: organization.id,
      domainKey: `deep-${suffix}.example.com`,
      domainSlug: `deep-${suffix}`,
      sourceUrl: `https://deep-${suffix}.example.com/`,
      status: "verified",
      verificationToken: `token-${suffix}`,
    })
    .returning();
  const [run] = await db
    .insert(schema.localisationDeepAudits)
    .values({ organizationId: organization.id, linkedDomainId: domain!.id })
    .returning();
  return run!;
}

function appWithQueue(enqueue: LocalisationDeepAuditQueue["enqueue"]) {
  return createApp({ localisationDeepAuditQueue: { enqueue } });
}

describe("internal deep audit start route", () => {
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("rejects requests without the go-svc service token", async () => {
    const app = appWithQueue(vi.fn());
    const response = await app.request(`/api/internal/deep-audits/${randomUUID()}/start`, {
      method: "POST",
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown run", async () => {
    const app = appWithQueue(vi.fn());
    const response = await app.request(`/api/internal/deep-audits/${randomUUID()}/start`, {
      method: "POST",
      headers: serviceHeaders(),
    });
    expect(response.status).toBe(404);
  });

  it("starts the workflow once and stores the workflow run id", async () => {
    const run = await seedRun();
    const enqueue = vi.fn(async () => ({ ids: ["wrun_test"] }));
    const app = appWithQueue(enqueue);

    const first = await app.request(`/api/internal/deep-audits/${run.id}/start`, {
      method: "POST",
      headers: serviceHeaders(),
    });
    expect(first.status).toBe(202);
    await expect(first.json()).resolves.toMatchObject({ workflowRunId: "wrun_test" });
    expect(enqueue).toHaveBeenCalledWith({ runId: run.id });

    const second = await app.request(`/api/internal/deep-audits/${run.id}/start`, {
      method: "POST",
      headers: serviceHeaders(),
    });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ alreadyStarted: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("marks the run failed when the workflow cannot start", async () => {
    const run = await seedRun();
    const app = appWithQueue(async () => {
      throw new Error("workflow down");
    });

    const response = await app.request(`/api/internal/deep-audits/${run.id}/start`, {
      method: "POST",
      headers: serviceHeaders(),
    });
    expect(response.status).toBe(503);

    const [stored] = await db
      .select({
        status: schema.localisationDeepAudits.status,
        errorCode: schema.localisationDeepAudits.errorCode,
      })
      .from(schema.localisationDeepAudits)
      .where(eq(schema.localisationDeepAudits.id, run.id));
    expect(stored).toEqual({ status: "failed", errorCode: "deep_audit_start_failed" });
  });
});
