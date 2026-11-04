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

const runDueProjectContentSyncsMock = vi.fn(async () => ({
  due: 1,
  started: 1,
  skipped: 0,
  failed: 0,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/projects/content-sync/project-content-sync", () => ({
    runDueProjectContentSyncs: runDueProjectContentSyncsMock,
  }));
  vi.doMock("@/lib/env", () => ({ env: { CRON_SECRET: cronSecret } }));

  const { createProjectContentSyncCronRoutes } = await import("./project-content-sync.route");
  return testClient(
    createProjectContentSyncCronRoutes({ projectContentSyncQueue: { enqueue: vi.fn() } }),
  );
}

describe("project content sync cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/projects/content-sync/project-content-sync");
    vi.doUnmock("@/lib/env");
    runDueProjectContentSyncsMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();
    const response = await client.index.$get();
    expect(response.status).toBe(401);
    expect(runDueProjectContentSyncsMock).not.toHaveBeenCalled();
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    const client = await createClient({ cronSecret: null });
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );
    expect(response.status).toBe(503);
  });

  it("runs due syncs when authorized", async () => {
    const client = await createClient();
    const response = await client.index.$get(
      {},
      { headers: { authorization: "Bearer cron-secret" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: { due: 1, started: 1, skipped: 0, failed: 0 },
    });
    expect(runDueProjectContentSyncsMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
  });
});
