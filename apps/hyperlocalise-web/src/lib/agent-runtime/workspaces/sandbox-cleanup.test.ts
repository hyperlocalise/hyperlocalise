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
import { describe, expect, it, vi } from "vite-plus/test";

import { runSandboxCleanup, SANDBOX_CLEANUP_MAX_AGE_MS } from "./sandbox-cleanup";

describe("runSandboxCleanup", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("deletes sandboxes older than seven days and stops at the first young sandbox", async () => {
    const eightDaysAgo = now.getTime() - 8 * 24 * 60 * 60 * 1000;
    const nineDaysAgo = now.getTime() - 9 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now.getTime() - 1 * 24 * 60 * 60 * 1000;

    const deleteSandbox = vi.fn(async () => undefined);
    const listed = [
      { name: "old-a", createdAt: nineDaysAgo, status: "stopped" },
      { name: "old-b", createdAt: eightDaysAgo, status: "stopped" },
      { name: "young-c", createdAt: oneDayAgo, status: "stopped" },
      { name: "young-d", createdAt: oneDayAgo, status: "running" },
    ];

    const result = await runSandboxCleanup({
      deps: {
        now,
        listSandboxes: async () => listed,
        deleteSandbox,
      },
    });

    expect(result).toEqual({
      scanned: 3,
      expired: 2,
      deleted: 2,
      failed: 0,
      skippedYoung: 1,
    });
    expect(deleteSandbox).toHaveBeenCalledTimes(2);
    expect(deleteSandbox).toHaveBeenCalledWith("old-a", undefined);
    expect(deleteSandbox).toHaveBeenCalledWith("old-b", undefined);
  });

  it("respects the per-tick delete limit", async () => {
    const old = now.getTime() - SANDBOX_CLEANUP_MAX_AGE_MS - 1;
    const listed = Array.from({ length: 5 }, (_, index) => ({
      name: `old-${index}`,
      createdAt: old - index,
      status: "stopped",
    }));
    const deleteSandbox = vi.fn(async () => undefined);

    const result = await runSandboxCleanup({
      limit: 2,
      deps: {
        now,
        listSandboxes: async () => listed,
        deleteSandbox,
      },
    });

    expect(result.expired).toBe(2);
    expect(result.deleted).toBe(2);
    expect(deleteSandbox).toHaveBeenCalledTimes(2);
  });

  it("counts delete failures without aborting the rest", async () => {
    const old = now.getTime() - SANDBOX_CLEANUP_MAX_AGE_MS - 1;
    const listed = [
      { name: "old-a", createdAt: old, status: "stopped" },
      { name: "old-b", createdAt: old, status: "stopped" },
    ];
    const deleteSandbox = vi.fn(async (name: string) => {
      if (name === "old-a") {
        throw new Error("delete failed");
      }
    });

    const result = await runSandboxCleanup({
      deps: {
        now,
        listSandboxes: async () => listed,
        deleteSandbox,
      },
    });

    expect(result).toMatchObject({
      expired: 2,
      deleted: 1,
      failed: 1,
    });
  });

  it("returns empty counts when nothing is expired", async () => {
    const listed = [
      {
        name: "young",
        createdAt: now.getTime() - 60_000,
        status: "stopped",
      },
    ];

    const result = await runSandboxCleanup({
      deps: {
        now,
        listSandboxes: async () => listed,
        deleteSandbox: vi.fn(async () => undefined),
      },
    });

    expect(result).toEqual({
      scanned: 1,
      expired: 0,
      deleted: 0,
      failed: 0,
      skippedYoung: 1,
    });
  });
});
