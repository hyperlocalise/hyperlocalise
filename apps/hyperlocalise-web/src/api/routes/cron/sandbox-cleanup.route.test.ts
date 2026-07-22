/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const runSandboxCleanupMock = vi.fn(async () => ({
  scanned: 3,
  expired: 2,
  deleted: 2,
  failed: 0,
  skippedYoung: 1,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/agent-runtime/workspaces/sandbox-cleanup", () => ({
    runSandboxCleanup: runSandboxCleanupMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
      SANDBOX_CLEANUP_MAX_PER_TICK: 50,
    },
  }));

  const { createSandboxCleanupRoutes } = await import("./sandbox-cleanup.route");

  return testClient(createSandboxCleanupRoutes());
}

describe("sandbox cleanup cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/agent-runtime/workspaces/sandbox-cleanup");
    vi.doUnmock("@/lib/env");
    runSandboxCleanupMock.mockClear();
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
    await expect(response.json()).resolves.toEqual({ error: "sandbox_cleanup_misconfigured" });
  });

  it("runs sandbox cleanup when authorized", async () => {
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
      },
    });
    expect(runSandboxCleanupMock).toHaveBeenCalledTimes(1);
    expect(runSandboxCleanupMock).toHaveBeenCalledWith({ limit: 50 });
  });
});
