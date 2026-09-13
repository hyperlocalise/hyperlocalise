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

const runDueTranslationQaScansMock = vi.fn(async () => ({
  scanned: 2,
  started: 2,
  succeeded: 2,
  failed: 0,
  skipped: 0,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/qa/schedule-due-qa-scans", () => ({
    runDueTranslationQaScans: runDueTranslationQaScansMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
      TRANSLATION_QA_SCAN_MAX_PROJECTS_PER_TICK: 10,
    },
  }));

  const { createTranslationQaScanRoutes } = await import("./translation-qa-scan.route");
  return testClient(createTranslationQaScanRoutes());
}

describe("translation QA scan cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/qa/schedule-due-qa-scans");
    vi.doUnmock("@/lib/env");
    runDueTranslationQaScansMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();
    const response = await client.index.$get();
    expect(response.status).toBe(401);
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    const client = await createClient({ cronSecret: null });
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );
    expect(response.status).toBe(503);
  });

  it("runs due scans when authorized", async () => {
    const client = await createClient();
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        scanned: 2,
        started: 2,
        succeeded: 2,
        failed: 0,
        skipped: 0,
      },
    });
    expect(runDueTranslationQaScansMock).toHaveBeenCalledWith({
      limit: 10,
      queue: expect.any(Object),
    });
  });
});
