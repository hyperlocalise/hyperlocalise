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

const runJobChangeEventPumpMock = vi.fn(async () => ({
  events: { claimed: 2, dispatched: 2, failed: 0 },
  webhooks: { claimed: 1, delivered: 1, retried: 0, failed: 0 },
  pruned: { events: 4, deliveries: 3 },
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/job-change-events/job-change-event-pump", () => ({
    runJobChangeEventPump: runJobChangeEventPumpMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
    },
  }));

  const { createJobChangeEventsCronRoutes } = await import("./job-change-events.route");
  return testClient(createJobChangeEventsCronRoutes());
}

describe("job change events cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/job-change-events/job-change-event-pump");
    vi.doUnmock("@/lib/env");
    runJobChangeEventPumpMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();
    const response = await client.index.$get();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(runJobChangeEventPumpMock).not.toHaveBeenCalled();
  });

  it("answers 503 when no cron secret is configured", async () => {
    const client = await createClient({ cronSecret: null });
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "job_change_events_misconfigured" });
    expect(runJobChangeEventPumpMock).not.toHaveBeenCalled();
  });

  it("runs the pump when authorized", async () => {
    const client = await createClient();
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        events: { claimed: 2, dispatched: 2, failed: 0 },
        webhooks: { claimed: 1, delivered: 1, retried: 0, failed: 0 },
        pruned: { events: 4, deliveries: 3 },
      },
    });
    expect(runJobChangeEventPumpMock).toHaveBeenCalledTimes(1);
  });
});
