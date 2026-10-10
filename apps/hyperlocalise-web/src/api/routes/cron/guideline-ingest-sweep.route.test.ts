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
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

const sweepMock = vi.fn(async () => ({ scanned: 2, republished: 2, failed: 0 }));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/go-svc/go-svc-server-client", () => ({
    createGoSvcServerClient: () => ({ guidelines: { sweep: sweepMock } }),
  }));
  vi.doMock("@/lib/env", () => ({ env: { CRON_SECRET: cronSecret } }));

  const { createGuidelineIngestSweepRoutes } = await import("./guideline-ingest-sweep.route");
  return testClient(createGuidelineIngestSweepRoutes());
}

const authorized = { headers: { authorization: "Bearer cron-secret" } };

describe("guideline ingest sweep cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/go-svc/go-svc-server-client");
    vi.doUnmock("@/lib/env");
    sweepMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();

    const response = await client.index.$get();

    expect(response.status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    const client = await createClient({ cronSecret: null });

    const response = await client.index.$get({}, authorized);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "guideline_ingest_sweep_misconfigured",
    });
  });

  it("asks go-svc to republish stranded documents", async () => {
    const client = await createClient();

    const response = await client.index.$get({}, authorized);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: { scanned: 2, republished: 2, failed: 0 },
    });
  });

  it("reports go-svc failures without leaking details", async () => {
    sweepMock.mockRejectedValueOnce(
      new GoSvcClientError({ code: "guideline_ingest_unavailable", message: "down", status: 503 }),
    );
    const client = await createClient();

    const response = await client.index.$get({}, authorized);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "guideline_ingest_sweep_failed",
      code: "guideline_ingest_unavailable",
    });
  });
});
