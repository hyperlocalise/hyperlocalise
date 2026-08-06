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

const runSnapshotCleanupMock = vi.fn(async () => ({
  scanned: 3,
  expired: 2,
  deleted: 2,
  failed: 0,
  skippedYoung: 1,
  skippedDeleted: 0,
  deletedBytes: 2048,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/agent-runtime/workspaces/snapshot-cleanup", () => ({
    runSnapshotCleanup: runSnapshotCleanupMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
      SNAPSHOT_CLEANUP_MAX_PER_TICK: 50,
    },
  }));

  const { createSnapshotCleanupRoutes } = await import("./snapshot-cleanup.route");

  return testClient(createSnapshotCleanupRoutes());
}

describe("snapshot cleanup cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/agent-runtime/workspaces/snapshot-cleanup");
    vi.doUnmock("@/lib/env");
    runSnapshotCleanupMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();

    const response = await client.index.$get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    const client = await createClient({ cronSecret: null });

    const response = await client.index.$get(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "snapshot_cleanup_misconfigured" });
  });

  it("runs snapshot cleanup when authorized", async () => {
    const client = await createClient();

    const response = await client.index.$get(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        scanned: 3,
        expired: 2,
        deleted: 2,
        failed: 0,
        skippedYoung: 1,
        skippedDeleted: 0,
        deletedBytes: 2048,
      },
    });
    expect(runSnapshotCleanupMock).toHaveBeenCalledTimes(1);
    expect(runSnapshotCleanupMock).toHaveBeenCalledWith({ limit: 50 });
  });
});
