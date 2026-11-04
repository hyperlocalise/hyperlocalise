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
import { and, asc, desc, eq, lt, lte, ne, sql } from "drizzle-orm";

import {
  contentSyncFingerprintFromConfig,
  validateContentSyncConfig,
} from "@/lib/agents/content-sync/content-sync-config";
import {
  normalizeContentSyncConfig,
  type ContentSyncConfig,
} from "@/lib/agents/content-sync/content-sync-types";
import { executeContentSyncConfig } from "@/lib/agents/content-sync/execute-content-sync";
import { db, schema, type DatabaseTransaction } from "@/lib/database/client";
import type {
  ProjectContentSyncRunTrigger,
  ProjectContentSyncSchedule,
} from "@/lib/database/schema/project-content-sync";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import type { ProjectContentSyncQueue } from "@/lib/workflow/types";

const logger = createLogger("project-content-sync");

/**
 * A `running` run older than this is treated as dead and no longer holds the sync. It sits above
 * the longest a workflow step may run, so a live run is never taken over.
 */
export const STALE_CONTENT_SYNC_RUN_MS = 15 * 60 * 1000;

const SCHEDULE_INTERVAL_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
} as const satisfies Record<Exclude<ProjectContentSyncSchedule, "manual">, number>;

const STALE_RUN_ERROR = {
  code: "content_sync_stale",
  message: "The sync did not finish in time.",
} as const;

const UNEXPECTED_RUN_ERROR = {
  code: "content_sync_failed",
  message: "The sync stopped unexpectedly.",
} as const;

export type ProjectContentSyncRow = typeof schema.projectContentSyncs.$inferSelect;
export type ProjectContentSyncRunRow = typeof schema.projectContentSyncRuns.$inferSelect;

function nextScheduledContentSyncRunAt(
  schedule: ProjectContentSyncSchedule,
  from: Date,
): Date | null {
  if (schedule === "manual") {
    return null;
  }
  return new Date(from.getTime() + SCHEDULE_INTERVAL_MS[schedule]);
}

/** Steps a due time forward by whole intervals, so late cron ticks do not push the schedule back. */
export function followingScheduledContentSyncRunAt(
  schedule: ProjectContentSyncSchedule,
  dueAt: Date,
  now: Date,
): Date | null {
  if (schedule === "manual") {
    return null;
  }
  const interval = SCHEDULE_INTERVAL_MS[schedule];
  const missed = Math.floor((now.getTime() - dueAt.getTime()) / interval);
  return new Date(dueAt.getTime() + (Math.max(missed, 0) + 1) * interval);
}

function contentSyncRunLockKey(syncId: string): string {
  return `project_content_sync:${syncId}`;
}

export async function getProjectContentSync(input: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectContentSyncRow | null> {
  const [sync] = await db
    .select()
    .from(schema.projectContentSyncs)
    .where(
      and(
        eq(schema.projectContentSyncs.organizationId, input.organizationId),
        eq(schema.projectContentSyncs.projectId, input.projectId),
      ),
    )
    .limit(1);
  return sync ?? null;
}

export async function saveProjectContentSync(input: {
  organizationId: string;
  projectId: string;
  syncConfig: ContentSyncConfig;
  schedule: ProjectContentSyncSchedule;
  userId: string | null;
  now?: Date;
}): Promise<ProjectContentSyncRow> {
  const now = input.now ?? new Date();
  const nextRunAt = nextScheduledContentSyncRunAt(input.schedule, now);

  const [saved] = await db
    .insert(schema.projectContentSyncs)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      syncConfig: input.syncConfig,
      schedule: input.schedule,
      nextRunAt,
      updatedByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: schema.projectContentSyncs.projectId,
      set: {
        syncConfig: input.syncConfig,
        schedule: input.schedule,
        // Keep the next scheduled time when only the settings change, so saving does not delay a run.
        nextRunAt: sql`case when ${schema.projectContentSyncs.schedule} = excluded.schedule then coalesce(${schema.projectContentSyncs.nextRunAt}, excluded.next_run_at) else excluded.next_run_at end`,
        updatedByUserId: input.userId,
        updatedAt: now,
      },
      setWhere: eq(schema.projectContentSyncs.organizationId, input.organizationId),
    })
    .returning();
  if (!saved) {
    throw new Error("project content sync belongs to another organization");
  }
  return saved;
}

/** An active content-sync automation already moving the same repository folder into this project. */
export async function findOverlappingContentSyncAutomation(input: {
  organizationId: string;
  projectId: string;
  syncConfig: ContentSyncConfig;
}): Promise<{ id: string } | null> {
  const [automation] = await db
    .select({ id: schema.workspaceAutomations.id })
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
        eq(schema.workspaceAutomations.projectId, input.projectId),
        eq(schema.workspaceAutomations.kind, "content_sync"),
        eq(schema.workspaceAutomations.status, "active"),
        eq(
          schema.workspaceAutomations.syncFingerprint,
          contentSyncFingerprintFromConfig(input.syncConfig),
        ),
      ),
    )
    .limit(1);
  return automation ?? null;
}

/** Deletes the sync and its run history, unless a run is going: that run still holds the repository. */
export async function deleteProjectContentSync(input: {
  organizationId: string;
  projectId: string;
  now?: Date;
}): Promise<Result<void, { code: "content_sync_not_found" | "content_sync_in_progress" }>> {
  const sync = await getProjectContentSync(input);
  if (!sync) {
    return err({ code: "content_sync_not_found" as const });
  }
  return db.transaction(async (tx) => {
    await lockContentSyncRuns(tx, sync.id);
    await failStaleContentSyncRuns({ executor: tx, syncId: sync.id, now: input.now ?? new Date() });
    if (await hasRunningContentSyncRun(tx, sync.id)) {
      return err({ code: "content_sync_in_progress" as const });
    }
    await tx.delete(schema.projectContentSyncs).where(eq(schema.projectContentSyncs.id, sync.id));
    return ok(undefined);
  });
}

export async function listProjectContentSyncRuns(input: {
  organizationId: string;
  syncId: string;
  limit: number;
  now?: Date;
}): Promise<ProjectContentSyncRunRow[]> {
  // A run whose workflow died shows as failed at once instead of holding Sync now until the cron runs.
  await failStaleContentSyncRuns({
    executor: db,
    syncId: input.syncId,
    now: input.now ?? new Date(),
  });
  return db
    .select()
    .from(schema.projectContentSyncRuns)
    .where(
      and(
        eq(schema.projectContentSyncRuns.organizationId, input.organizationId),
        eq(schema.projectContentSyncRuns.syncId, input.syncId),
      ),
    )
    .orderBy(desc(schema.projectContentSyncRuns.createdAt))
    .limit(input.limit);
}

async function failStaleContentSyncRuns(input: {
  executor: DatabaseTransaction | typeof db;
  syncId?: string;
  now: Date;
}) {
  const cutoff = new Date(input.now.getTime() - STALE_CONTENT_SYNC_RUN_MS);
  const filters = [
    eq(schema.projectContentSyncRuns.status, "running"),
    lt(schema.projectContentSyncRuns.startedAt, cutoff),
  ];
  if (input.syncId) {
    filters.push(eq(schema.projectContentSyncRuns.syncId, input.syncId));
  }
  const failed = await input.executor
    .update(schema.projectContentSyncRuns)
    .set({
      status: "failed",
      errorCode: STALE_RUN_ERROR.code,
      errorMessage: STALE_RUN_ERROR.message,
      completedAt: input.now,
    })
    .where(and(...filters))
    .returning({ id: schema.projectContentSyncRuns.id });
  for (const run of failed) {
    logger.error({ runId: run.id }, "project content sync run timed out");
  }
}

async function lockContentSyncRuns(tx: DatabaseTransaction, syncId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${contentSyncRunLockKey(syncId)}, 0))`,
  );
}

async function hasRunningContentSyncRun(tx: DatabaseTransaction, syncId: string) {
  const [active] = await tx
    .select({ id: schema.projectContentSyncRuns.id })
    .from(schema.projectContentSyncRuns)
    .where(
      and(
        eq(schema.projectContentSyncRuns.syncId, syncId),
        eq(schema.projectContentSyncRuns.status, "running"),
      ),
    )
    .limit(1);
  return Boolean(active);
}

/**
 * Claims the sync's one active run. The advisory lock lasts only for this transaction, so
 * two claims cannot both see no running row; the `running` row then holds the sync until it
 * finishes or goes stale.
 */
export async function claimProjectContentSyncRun(input: {
  sync: Pick<ProjectContentSyncRow, "id" | "organizationId" | "projectId">;
  trigger: ProjectContentSyncRunTrigger;
  userId: string | null;
  now?: Date;
}): Promise<Result<ProjectContentSyncRunRow, { code: "content_sync_in_progress" }>> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockContentSyncRuns(tx, input.sync.id);
    await failStaleContentSyncRuns({ executor: tx, syncId: input.sync.id, now });
    if (await hasRunningContentSyncRun(tx, input.sync.id)) {
      return err({ code: "content_sync_in_progress" as const });
    }

    const [run] = await tx
      .insert(schema.projectContentSyncRuns)
      .values({
        syncId: input.sync.id,
        organizationId: input.sync.organizationId,
        projectId: input.sync.projectId,
        trigger: input.trigger,
        status: "running",
        triggeredByUserId: input.userId,
        startedAt: now,
      })
      .returning();
    if (!run) {
      throw new Error("project content sync run insert returned no row");
    }
    return ok(run);
  });
}

async function finishProjectContentSyncRun(input: {
  runId: string;
  outcome:
    | { status: "succeeded"; summary: Record<string, unknown> }
    | { status: "failed"; error: { code: string; message: string } };
}) {
  // Only a running run is finished: once failed as stale, another run may already hold the sync.
  const finished = await db
    .update(schema.projectContentSyncRuns)
    .set(
      input.outcome.status === "succeeded"
        ? {
            status: "succeeded",
            summary: input.outcome.summary,
            errorCode: null,
            errorMessage: null,
            completedAt: new Date(),
          }
        : {
            status: "failed",
            errorCode: input.outcome.error.code,
            errorMessage: input.outcome.error.message,
            completedAt: new Date(),
          },
    )
    .where(
      and(
        eq(schema.projectContentSyncRuns.id, input.runId),
        eq(schema.projectContentSyncRuns.status, "running"),
      ),
    )
    .returning({ id: schema.projectContentSyncRuns.id });
  if (finished.length === 0) {
    logger.warn(
      { runId: input.runId, outcome: input.outcome.status },
      "project content sync run finished after it was closed",
    );
  }
}

/** Closes a run whose workflow failed outside the sync itself, such as a step that timed out. */
export async function failProjectContentSyncRun(input: { runId: string }) {
  await finishProjectContentSyncRun({
    runId: input.runId,
    outcome: { status: "failed", error: UNEXPECTED_RUN_ERROR },
  });
}

/** Runs a claimed sync to the end and records the outcome; never throws. */
export async function executeProjectContentSyncRun(input: {
  organizationId: string;
  runId: string;
}): Promise<void> {
  try {
    const [row] = await db
      .select({ run: schema.projectContentSyncRuns, sync: schema.projectContentSyncs })
      .from(schema.projectContentSyncRuns)
      .innerJoin(
        schema.projectContentSyncs,
        eq(schema.projectContentSyncs.id, schema.projectContentSyncRuns.syncId),
      )
      .where(
        and(
          eq(schema.projectContentSyncRuns.organizationId, input.organizationId),
          eq(schema.projectContentSyncRuns.id, input.runId),
        ),
      )
      .limit(1);
    if (!row) {
      logger.warn({ runId: input.runId }, "project content sync run not found");
      return;
    }
    if (row.run.status !== "running") {
      logger.warn(
        { runId: input.runId, status: row.run.status },
        "project content sync run already finished",
      );
      return;
    }
    // The lease counts from when the work starts, not from when the run was queued. A run failed
    // as stale since it was read no longer holds the sync, so it must not start.
    const started = await db
      .update(schema.projectContentSyncRuns)
      .set({ startedAt: new Date() })
      .where(
        and(
          eq(schema.projectContentSyncRuns.id, row.run.id),
          eq(schema.projectContentSyncRuns.status, "running"),
        ),
      )
      .returning({ id: schema.projectContentSyncRuns.id });
    if (started.length === 0) {
      logger.warn({ runId: input.runId }, "project content sync run closed before it started");
      return;
    }

    const config = validateContentSyncConfig(normalizeContentSyncConfig(row.sync.syncConfig));
    if (isErr(config)) {
      await finishProjectContentSyncRun({
        runId: input.runId,
        outcome: { status: "failed", error: config.error },
      });
      return;
    }

    const result = await executeContentSyncConfig({
      organizationId: row.sync.organizationId,
      projectId: row.sync.projectId,
      workflowId: row.sync.id,
      runId: row.run.id,
      syncConfig: config.value,
      // One branch per sync, so a scheduled sync keeps updating its open pull request.
      pullRequestBranchKey: `sync-${row.sync.id}`,
    });
    await finishProjectContentSyncRun({
      runId: input.runId,
      outcome: isErr(result)
        ? { status: "failed", error: result.error }
        : { status: "succeeded", summary: { ...result.value, provider: config.value.provider } },
    });
    logger.info(
      { runId: input.runId, syncId: row.sync.id, ok: !isErr(result) },
      "project content sync run finished",
    );
  } catch (error) {
    logger.error(
      { runId: input.runId, err: serializeErrorForLog(error) },
      "project content sync run threw",
    );
    await finishProjectContentSyncRun({
      runId: input.runId,
      outcome: { status: "failed", error: UNEXPECTED_RUN_ERROR },
    }).catch((finishError: unknown) => {
      logger.error(
        { runId: input.runId, err: serializeErrorForLog(finishError) },
        "project content sync run could not be marked failed",
      );
    });
  }
}

/** Claims a run and hands it to the queue. Shared by Sync now and the timed job. */
export async function startProjectContentSyncRun(input: {
  sync: Pick<ProjectContentSyncRow, "id" | "organizationId" | "projectId">;
  trigger: ProjectContentSyncRunTrigger;
  userId: string | null;
  queue: ProjectContentSyncQueue;
}): Promise<Result<ProjectContentSyncRunRow, { code: "content_sync_in_progress" }>> {
  const claimed = await claimProjectContentSyncRun(input);
  if (isErr(claimed)) {
    return claimed;
  }

  try {
    await input.queue.enqueue({
      organizationId: input.sync.organizationId,
      runId: claimed.value.id,
    });
  } catch (error) {
    await finishProjectContentSyncRun({
      runId: claimed.value.id,
      outcome: {
        status: "failed",
        error: { code: "content_sync_enqueue_failed", message: "The sync could not be started." },
      },
    });
    throw error;
  }

  logger.info(
    { runId: claimed.value.id, syncId: input.sync.id, trigger: input.trigger },
    "project content sync run queued",
  );
  return claimed;
}

export async function runDueProjectContentSyncs(input: {
  limit: number;
  queue: ProjectContentSyncQueue;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await failStaleContentSyncRuns({ executor: db, now });

  const due = await db
    .select()
    .from(schema.projectContentSyncs)
    .where(
      and(
        ne(schema.projectContentSyncs.schedule, "manual"),
        lte(schema.projectContentSyncs.nextRunAt, now),
      ),
    )
    .orderBy(asc(schema.projectContentSyncs.nextRunAt))
    .limit(input.limit);

  let started = 0;
  let skipped = 0;
  let failed = 0;
  for (const sync of due) {
    try {
      if (!sync.nextRunAt) {
        continue;
      }
      // Moving next_run_at first means an overlapping tick, or a run that fails, waits for the next slot.
      const advanced = await db
        .update(schema.projectContentSyncs)
        .set({
          nextRunAt: followingScheduledContentSyncRunAt(sync.schedule, sync.nextRunAt, now),
        })
        .where(
          and(
            eq(schema.projectContentSyncs.id, sync.id),
            lte(schema.projectContentSyncs.nextRunAt, now),
          ),
        )
        .returning({ id: schema.projectContentSyncs.id });
      if (advanced.length === 0) {
        skipped += 1;
        continue;
      }

      const result = await startProjectContentSyncRun({
        sync,
        trigger: "scheduled",
        userId: null,
        queue: input.queue,
      });
      if (isErr(result)) {
        skipped += 1;
        continue;
      }
      started += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { syncId: sync.id, err: serializeErrorForLog(error) },
        "scheduled project content sync could not start",
      );
    }
  }

  return { due: due.length, started, skipped, failed };
}
