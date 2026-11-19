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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { testClient } from "hono/testing";

const runScheduledLocalisationAuditsMock = vi.fn(async () => ({
  eligible: 100,
  started: 20,
  reused: 0,
  failed: 0,
  quotaExceeded: false,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/localisation-audit/run-scheduled-localisation-audits", () => ({
    runScheduledLocalisationAudits: runScheduledLocalisationAuditsMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
    },
  }));

  const { createLocalisationAuditScheduleRoutes } =
    await import("./localisation-audit-schedule.route");
  return testClient(
    createLocalisationAuditScheduleRoutes({
      localisationAuditQueue: { enqueue: vi.fn(async () => ({ ids: [] })) },
    }),
  );
}

describe("localisation audit schedule cron route", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.doUnmock("@/lib/localisation-audit/run-scheduled-localisation-audits");
    vi.doUnmock("@/lib/env");
    runScheduledLocalisationAuditsMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();
    const response = await client.index.$get();
    expect(response.status).toBe(401);
    expect(runScheduledLocalisationAuditsMock).not.toHaveBeenCalled();
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    const client = await createClient({ cronSecret: null });
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );
    expect(response.status).toBe(503);
  });

  it("skips ticks that are not midnight in Sydney", async () => {
    // 13:00 UTC in July is 23:00 AEST.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-01T13:00:00Z"));
    const client = await createClient();
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: "not_local_midnight" });
    expect(runScheduledLocalisationAuditsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["AEDT", "2026-11-19T13:00:00Z"],
    ["AEST", "2026-07-01T14:00:00Z"],
  ])("starts scheduled audits at midnight %s", async (_zone, now) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const client = await createClient();
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: { eligible: 100, started: 20, reused: 0, failed: 0, quotaExceeded: false },
    });
    expect(runScheduledLocalisationAuditsMock).toHaveBeenCalledWith({
      limit: 20,
      queue: expect.any(Object),
    });
  });
});
