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
import { Snapshot } from "@vercel/sandbox";

import { createLogger } from "@/lib/log";

const logger = createLogger("snapshot-cleanup");

/** Snapshots older than this are eligible for permanent deletion. */
export const SNAPSHOT_CLEANUP_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Default max deletes per cron tick to stay within serverless time limits. */
export const SNAPSHOT_CLEANUP_DEFAULT_LIMIT = 100;

/**
 * Page size for `Snapshot.list`. Kept separate from the delete cap and clamped
 * to the Vercel snapshots API max (`limit` max 50).
 */
const SNAPSHOT_LIST_PAGE_SIZE = 50;

/** Bounded concurrency when calling the Vercel Snapshot delete API. */
const SNAPSHOT_DELETE_CONCURRENCY = 5;

export type SnapshotCleanupResult = {
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  skippedYoung: number;
  /** Snapshots already in the `deleted` state; listed but not re-deleted. */
  skippedDeleted: number;
  /** Sum of `sizeBytes` for successfully deleted snapshots. */
  deletedBytes: number;
};

type ListedSnapshot = {
  id: string;
  createdAt: number;
  status: string;
  sizeBytes: number;
};

type ListedSnapshotIterable = AsyncIterable<ListedSnapshot> | Iterable<ListedSnapshot>;

type SnapshotCleanupDeps = {
  listSnapshots?: (params: {
    sortOrder: "asc";
    pageSize: number;
    signal?: AbortSignal;
  }) => Promise<ListedSnapshotIterable>;
  deleteSnapshot?: (snapshotId: string, signal?: AbortSignal) => Promise<void>;
  now?: Date;
};

async function defaultListSnapshots(params: {
  sortOrder: "asc";
  pageSize: number;
  signal?: AbortSignal;
}): Promise<ListedSnapshotIterable> {
  return Snapshot.list({
    sortOrder: params.sortOrder,
    limit: params.pageSize,
    signal: params.signal,
  });
}

async function defaultDeleteSnapshot(snapshotId: string, signal?: AbortSignal): Promise<void> {
  const snapshot = await Snapshot.get({ snapshotId, signal });
  await snapshot.delete({ signal });
}

function isExpired(createdAtMs: number, nowMs: number, maxAgeMs: number) {
  return nowMs - createdAtMs >= maxAgeMs;
}

async function deleteWithBoundedConcurrency(
  targets: { id: string; sizeBytes: number }[],
  concurrency: number,
  deleteSnapshot: (snapshotId: string, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<{ deleted: number; failed: number; deletedBytes: number }> {
  let deleted = 0;
  let failed = 0;
  let deletedBytes = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targets.length) {
      if (signal?.aborted) {
        return;
      }

      const currentIndex = nextIndex;
      nextIndex += 1;
      const target = targets[currentIndex];
      if (!target) {
        return;
      }

      try {
        await deleteSnapshot(target.id, signal);
        deleted += 1;
        deletedBytes += target.sizeBytes;
      } catch (error) {
        failed += 1;
        logger.warn(
          {
            snapshotId: target.id,
            error: error instanceof Error ? error.message : "unknown",
          },
          "failed to delete expired snapshot",
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
  await Promise.all(workers);
  return { deleted, failed, deletedBytes };
}

/**
 * Lists Vercel sandbox snapshots oldest-first and permanently deletes those
 * older than {@link SNAPSHOT_CLEANUP_MAX_AGE_MS}. Stops once a young snapshot is
 * seen (list is sorted by createdAt ascending) or the per-tick limit is reached.
 *
 * Sandboxes are persistent by default, so snapshots accrue from ordinary
 * `stop()` calls even though nothing here creates them explicitly.
 */
export async function runSnapshotCleanup(input?: {
  limit?: number;
  maxAgeMs?: number;
  signal?: AbortSignal;
  deps?: SnapshotCleanupDeps;
}): Promise<SnapshotCleanupResult> {
  const limit = input?.limit ?? SNAPSHOT_CLEANUP_DEFAULT_LIMIT;
  const maxAgeMs = input?.maxAgeMs ?? SNAPSHOT_CLEANUP_MAX_AGE_MS;
  const nowMs = (input?.deps?.now ?? new Date()).getTime();
  const listSnapshots = input?.deps?.listSnapshots ?? defaultListSnapshots;
  const deleteSnapshot = input?.deps?.deleteSnapshot ?? defaultDeleteSnapshot;

  const result: SnapshotCleanupResult = {
    scanned: 0,
    expired: 0,
    deleted: 0,
    failed: 0,
    skippedYoung: 0,
    skippedDeleted: 0,
    deletedBytes: 0,
  };

  const expiredTargets: { id: string; sizeBytes: number }[] = [];
  const listed = await listSnapshots({
    sortOrder: "asc",
    pageSize: Math.min(limit, SNAPSHOT_LIST_PAGE_SIZE),
    signal: input?.signal,
  });

  for await (const snapshot of listed) {
    if (input?.signal?.aborted) {
      break;
    }

    result.scanned += 1;

    if (!isExpired(snapshot.createdAt, nowMs, maxAgeMs)) {
      result.skippedYoung += 1;
      // Remaining pages are newer when sorted by createdAt ascending.
      break;
    }

    if (snapshot.status === "deleted") {
      result.skippedDeleted += 1;
      continue;
    }

    result.expired += 1;
    expiredTargets.push({ id: snapshot.id, sizeBytes: snapshot.sizeBytes });

    if (expiredTargets.length >= limit) {
      break;
    }
  }

  if (expiredTargets.length === 0) {
    logger.info(result, "snapshot cleanup completed; nothing to delete");
    return result;
  }

  const deleteResult = await deleteWithBoundedConcurrency(
    expiredTargets,
    SNAPSHOT_DELETE_CONCURRENCY,
    deleteSnapshot,
    input?.signal,
  );
  result.deleted = deleteResult.deleted;
  result.failed = deleteResult.failed;
  result.deletedBytes = deleteResult.deletedBytes;

  logger.info(result, "snapshot cleanup completed");
  return result;
}
