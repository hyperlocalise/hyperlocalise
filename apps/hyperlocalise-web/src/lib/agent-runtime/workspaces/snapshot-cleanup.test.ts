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
import { describe, expect, it, vi } from "vite-plus/test";

import { runSnapshotCleanup, SNAPSHOT_CLEANUP_MAX_AGE_MS } from "./snapshot-cleanup";

describe("runSnapshotCleanup", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("deletes snapshots older than three days and stops at the first young snapshot", async () => {
    const fourDaysAgo = now.getTime() - 4 * 24 * 60 * 60 * 1000;
    const fiveDaysAgo = now.getTime() - 5 * 24 * 60 * 60 * 1000;
    const oneDayAgo = now.getTime() - 1 * 24 * 60 * 60 * 1000;

    const deleteSnapshot = vi.fn(async () => undefined);
    const listed = [
      { id: "snap-old-a", createdAt: fiveDaysAgo, status: "created", sizeBytes: 100 },
      { id: "snap-old-b", createdAt: fourDaysAgo, status: "created", sizeBytes: 250 },
      { id: "snap-young-c", createdAt: oneDayAgo, status: "created", sizeBytes: 400 },
      { id: "snap-young-d", createdAt: oneDayAgo, status: "created", sizeBytes: 500 },
    ];

    const result = await runSnapshotCleanup({
      deps: {
        now,
        listSnapshots: async () => listed,
        deleteSnapshot,
      },
    });

    expect(result).toEqual({
      scanned: 3,
      expired: 2,
      deleted: 2,
      failed: 0,
      skippedYoung: 1,
      skippedDeleted: 0,
      deletedBytes: 350,
    });
    expect(deleteSnapshot).toHaveBeenCalledTimes(2);
    expect(deleteSnapshot).toHaveBeenCalledWith("snap-old-a", undefined);
    expect(deleteSnapshot).toHaveBeenCalledWith("snap-old-b", undefined);
  });

  it("skips snapshots already in the deleted state", async () => {
    const old = now.getTime() - SNAPSHOT_CLEANUP_MAX_AGE_MS - 1;
    const deleteSnapshot = vi.fn(async () => undefined);
    const listed = [
      { id: "snap-gone", createdAt: old, status: "deleted", sizeBytes: 100 },
      { id: "snap-old", createdAt: old, status: "created", sizeBytes: 100 },
    ];

    const result = await runSnapshotCleanup({
      deps: {
        now,
        listSnapshots: async () => listed,
        deleteSnapshot,
      },
    });

    expect(result).toMatchObject({
      scanned: 2,
      expired: 1,
      deleted: 1,
      skippedDeleted: 1,
    });
    expect(deleteSnapshot).toHaveBeenCalledTimes(1);
    expect(deleteSnapshot).toHaveBeenCalledWith("snap-old", undefined);
  });

  it("respects the per-tick delete limit", async () => {
    const old = now.getTime() - SNAPSHOT_CLEANUP_MAX_AGE_MS - 1;
    const listed = Array.from({ length: 5 }, (_, index) => ({
      id: `snap-old-${index}`,
      createdAt: old - index,
      status: "created",
      sizeBytes: 10,
    }));
    const deleteSnapshot = vi.fn(async () => undefined);

    const result = await runSnapshotCleanup({
      limit: 2,
      deps: {
        now,
        listSnapshots: async () => listed,
        deleteSnapshot,
      },
    });

    expect(result.expired).toBe(2);
    expect(result.deleted).toBe(2);
    expect(deleteSnapshot).toHaveBeenCalledTimes(2);
  });

  it("counts delete failures without aborting the rest", async () => {
    const old = now.getTime() - SNAPSHOT_CLEANUP_MAX_AGE_MS - 1;
    const listed = [
      { id: "snap-a", createdAt: old, status: "created", sizeBytes: 100 },
      { id: "snap-b", createdAt: old, status: "created", sizeBytes: 200 },
    ];
    const deleteSnapshot = vi.fn(async (snapshotId: string) => {
      if (snapshotId === "snap-a") {
        throw new Error("delete failed");
      }
    });

    const result = await runSnapshotCleanup({
      deps: {
        now,
        listSnapshots: async () => listed,
        deleteSnapshot,
      },
    });

    expect(result).toMatchObject({
      expired: 2,
      deleted: 1,
      failed: 1,
      deletedBytes: 200,
    });
  });

  it("returns empty counts when nothing is expired", async () => {
    const listed = [
      {
        id: "snap-young",
        createdAt: now.getTime() - 60_000,
        status: "created",
        sizeBytes: 100,
      },
    ];

    const result = await runSnapshotCleanup({
      deps: {
        now,
        listSnapshots: async () => listed,
        deleteSnapshot: vi.fn(async () => undefined),
      },
    });

    expect(result).toEqual({
      scanned: 1,
      expired: 0,
      deleted: 0,
      failed: 0,
      skippedYoung: 1,
      skippedDeleted: 0,
      deletedBytes: 0,
    });
  });
});
