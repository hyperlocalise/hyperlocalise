import { Sandbox } from "@vercel/sandbox";

import { createLogger } from "@/lib/log";

const logger = createLogger("sandbox-cleanup");

/** Sandboxes older than this are eligible for permanent deletion. */
export const SANDBOX_CLEANUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Default max deletes per cron tick to stay within serverless time limits. */
export const SANDBOX_CLEANUP_DEFAULT_LIMIT = 100;

/** Bounded concurrency when calling the Vercel Sandbox delete API. */
const SANDBOX_DELETE_CONCURRENCY = 5;

export type SandboxCleanupResult = {
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  skippedYoung: number;
};

type ListedSandbox = {
  name: string;
  createdAt: number;
  status: string;
};

type SandboxCleanupDeps = {
  listSandboxes?: (params: {
    sortBy: "createdAt";
    sortOrder: "asc";
    limit: number;
    signal?: AbortSignal;
  }) => Promise<AsyncIterable<ListedSandbox>>;
  deleteSandbox?: (name: string, signal?: AbortSignal) => Promise<void>;
  now?: Date;
};

async function defaultListSandboxes(params: {
  sortBy: "createdAt";
  sortOrder: "asc";
  limit: number;
  signal?: AbortSignal;
}): Promise<AsyncIterable<ListedSandbox>> {
  return Sandbox.list({
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    limit: params.limit,
    signal: params.signal,
  });
}

async function defaultDeleteSandbox(name: string, signal?: AbortSignal): Promise<void> {
  const sandbox = await Sandbox.get({ name, resume: false, signal });
  await sandbox.delete({ signal });
}

function isExpired(createdAtMs: number, nowMs: number, maxAgeMs: number) {
  return nowMs - createdAtMs >= maxAgeMs;
}

async function deleteWithBoundedConcurrency(
  names: string[],
  concurrency: number,
  deleteSandbox: (name: string, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < names.length) {
      if (signal?.aborted) {
        return;
      }

      const currentIndex = nextIndex;
      nextIndex += 1;
      const name = names[currentIndex];
      if (!name) {
        return;
      }

      try {
        await deleteSandbox(name, signal);
        deleted += 1;
      } catch (error) {
        failed += 1;
        logger.warn(
          {
            sandboxId: name,
            error: error instanceof Error ? error.message : "unknown",
          },
          "failed to delete expired sandbox",
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, names.length) }, () => worker());
  await Promise.all(workers);
  return { deleted, failed };
}

/**
 * Lists Vercel sandboxes oldest-first and permanently deletes those older than
 * {@link SANDBOX_CLEANUP_MAX_AGE_MS}. Stops once a young sandbox is seen (list is
 * sorted by createdAt ascending) or the per-tick limit is reached.
 */
export async function runSandboxCleanup(input?: {
  limit?: number;
  maxAgeMs?: number;
  signal?: AbortSignal;
  deps?: SandboxCleanupDeps;
}): Promise<SandboxCleanupResult> {
  const limit = input?.limit ?? SANDBOX_CLEANUP_DEFAULT_LIMIT;
  const maxAgeMs = input?.maxAgeMs ?? SANDBOX_CLEANUP_MAX_AGE_MS;
  const nowMs = (input?.deps?.now ?? new Date()).getTime();
  const listSandboxes = input?.deps?.listSandboxes ?? defaultListSandboxes;
  const deleteSandbox = input?.deps?.deleteSandbox ?? defaultDeleteSandbox;

  const result: SandboxCleanupResult = {
    scanned: 0,
    expired: 0,
    deleted: 0,
    failed: 0,
    skippedYoung: 0,
  };

  const expiredNames: string[] = [];
  const listed = await listSandboxes({
    sortBy: "createdAt",
    sortOrder: "asc",
    limit,
    signal: input?.signal,
  });

  for await (const sandbox of listed) {
    if (input?.signal?.aborted) {
      break;
    }

    result.scanned += 1;

    if (!isExpired(sandbox.createdAt, nowMs, maxAgeMs)) {
      result.skippedYoung += 1;
      // Remaining pages are newer when sorted by createdAt ascending.
      break;
    }

    result.expired += 1;
    expiredNames.push(sandbox.name);

    if (expiredNames.length >= limit) {
      break;
    }
  }

  if (expiredNames.length === 0) {
    logger.info(result, "sandbox cleanup completed; nothing to delete");
    return result;
  }

  const deleteResult = await deleteWithBoundedConcurrency(
    expiredNames,
    SANDBOX_DELETE_CONCURRENCY,
    deleteSandbox,
    input?.signal,
  );
  result.deleted = deleteResult.deleted;
  result.failed = deleteResult.failed;

  logger.info(result, "sandbox cleanup completed");
  return result;
}
