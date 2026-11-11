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
import { getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import type { SelectedFieldsFlat } from "drizzle-orm/pg-core";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";

import { schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database/client";

import type { JobChangeEventType } from "./job-change-events-contract";

/**
 * The only way to write `jobs` rows. Each write records its job changes (creation, a new status,
 * assignee, due date, title or description) in `job_change_events` in the same transaction, so a
 * change is never lost and never announced for a write that rolled back.
 * `job-writes.guard.test.ts` fails on any other `insert(schema.jobs)` or `update(schema.jobs)`.
 * The Go public API does the same in `apps/public-api/jobs-store.go`.
 */

type JobRow = typeof schema.jobs.$inferSelect;
type JobInsert = typeof schema.jobs.$inferInsert;
type JobSet = Partial<Omit<JobInsert, "id">>;

// Title and description live in the job's input metadata, as `updateNativeJob` writes them.
const jobTitle = sql<string | null>`${schema.jobs.inputPayload}->'metadata'->>'title'`;
const jobDescription = sql<string | null>`${schema.jobs.inputPayload}->'metadata'->>'description'`;

const trackedColumns = {
  __jobId: schema.jobs.id,
  __organizationId: schema.jobs.organizationId,
  __projectId: schema.jobs.projectId,
  __kind: schema.jobs.kind,
  __status: schema.jobs.status,
  __ownerUserId: schema.jobs.ownerUserId,
  __assigneeType: schema.jobs.assigneeType,
  __dueAt: schema.jobs.dueAt,
  __title: jobTitle,
  __description: jobDescription,
};

type TrackedRow = SelectResultFields<typeof trackedColumns>;
type PreviousState = Pick<JobRow, "status" | "ownerUserId" | "assigneeType" | "dueAt"> & {
  title: string | null;
  description: string | null;
};

/** Writes that leave these alone cannot change what an event reports, so they skip the lookup. */
function touchesTrackedColumns(set: JobSet): boolean {
  return (
    set.status !== undefined ||
    set.ownerUserId !== undefined ||
    set.assigneeType !== undefined ||
    set.dueAt !== undefined ||
    set.inputPayload !== undefined
  );
}

function changeTypes(previous: PreviousState, current: TrackedRow): JobChangeEventType[] {
  const types: JobChangeEventType[] = [];
  if (previous.status !== current.__status) {
    types.push("job.status_changed");
  }
  if (
    previous.ownerUserId !== current.__ownerUserId ||
    previous.assigneeType !== current.__assigneeType
  ) {
    types.push("job.assignee_changed");
  }
  if (previous.dueAt?.getTime() !== current.__dueAt?.getTime()) {
    types.push("job.due_date_changed");
  }
  if (previous.title !== current.__title || previous.description !== current.__description) {
    types.push("job.details_changed");
  }
  return types;
}

/**
 * A row with no previous state was created by this write. An update only reports rows it locked
 * beforehand; one that started matching between the lock and the update is left out.
 */
async function recordChanges(
  tx: DatabaseTransaction,
  rows: TrackedRow[],
  previousById: Map<string, PreviousState>,
  write: "insert" | "update",
) {
  const events = rows.flatMap((row) => {
    const previous = previousById.get(row.__jobId);
    if (!previous && write === "update") {
      return [];
    }
    const types = previous ? changeTypes(previous, row) : (["job.created"] as const);
    return types.map((type) => ({
      organizationId: row.__organizationId,
      jobId: row.__jobId,
      projectId: row.__projectId,
      kind: row.__kind,
      type,
      fromStatus: previous?.status ?? null,
      toStatus: row.__status,
      assigneeType: row.__assigneeType,
    }));
  });
  if (events.length > 0) {
    await tx.insert(schema.jobChangeEvents).values(events);
  }
}

function splitRow<TFields extends SelectedFieldsFlat>(
  row: TrackedRow & Record<string, unknown>,
  fields: TFields,
): SelectResultFields<TFields> {
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    projected[key] = row[key];
  }
  return projected as SelectResultFields<TFields>;
}

async function lockPreviousStates(tx: DatabaseTransaction, where: SQL | undefined) {
  const rows = await tx
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      ownerUserId: schema.jobs.ownerUserId,
      assigneeType: schema.jobs.assigneeType,
      dueAt: schema.jobs.dueAt,
      title: jobTitle,
      description: jobDescription,
    })
    .from(schema.jobs)
    .where(where)
    .for("update");
  return new Map(rows.map(({ id, ...state }) => [id, state]));
}

type UpdateJobsInput = { set: JobSet; where: SQL | undefined };

/** `update jobs set … where …`, recording each change for each row it changes. */
export async function updateJobs(database: DatabaseClient, input: UpdateJobsInput): Promise<void>;
export async function updateJobs<TFields extends SelectedFieldsFlat>(
  database: DatabaseClient,
  input: UpdateJobsInput & { returning: TFields },
): Promise<SelectResultFields<TFields>[]>;
export async function updateJobs<TFields extends SelectedFieldsFlat>(
  database: DatabaseClient,
  input: UpdateJobsInput & { returning?: TFields },
): Promise<SelectResultFields<TFields>[] | void> {
  const fields = (input.returning ?? {}) as TFields;

  if (!touchesTrackedColumns(input.set)) {
    const query = database.update(schema.jobs).set(input.set).where(input.where);
    if (!input.returning) {
      await query;
      return;
    }
    return (await query.returning(input.returning)) as SelectResultFields<TFields>[];
  }

  const rows = await database.transaction(async (tx) => {
    const previousById = await lockPreviousStates(tx, input.where);
    const updated = (await tx
      .update(schema.jobs)
      .set(input.set)
      .where(input.where)
      .returning({ ...fields, ...trackedColumns })) as (TrackedRow & Record<string, unknown>)[];
    await recordChanges(tx, updated, previousById, "update");
    return updated;
  });

  return input.returning ? rows.map((row) => splitRow(row, fields)) : undefined;
}

type InsertJobsInput = {
  values: JobInsert | JobInsert[];
  /** `doNothing` skips rows whose id exists; `doUpdate` applies `set` to them instead. */
  onConflict?: { action: "doNothing" } | { action: "doUpdate"; set: JobSet };
};

/** `insert into jobs …`, recording `job.created` for new rows and changes for upserted ones. */
export async function insertJobs(database: DatabaseClient, input: InsertJobsInput): Promise<void>;
export async function insertJobs(
  database: DatabaseClient,
  input: InsertJobsInput & { returning: "all" },
): Promise<JobRow[]>;
export async function insertJobs<TFields extends SelectedFieldsFlat>(
  database: DatabaseClient,
  input: InsertJobsInput & { returning: TFields },
): Promise<SelectResultFields<TFields>[]>;
export async function insertJobs<TFields extends SelectedFieldsFlat>(
  database: DatabaseClient,
  input: InsertJobsInput & { returning?: TFields | "all" },
): Promise<SelectResultFields<TFields>[] | JobRow[] | void> {
  const values = Array.isArray(input.values) ? input.values : [input.values];
  if (values.length === 0) {
    return input.returning ? [] : undefined;
  }
  const fields = (
    input.returning === "all" ? getTableColumns(schema.jobs) : (input.returning ?? {})
  ) as TFields;

  const rows = await database.transaction(async (tx) => {
    // An upsert can change an existing job, so lock what it was to tell creation from a change.
    const previousById =
      input.onConflict?.action === "doUpdate"
        ? await lockPreviousStates(
            tx,
            inArray(
              schema.jobs.id,
              values.map((value) => value.id),
            ),
          )
        : new Map<string, PreviousState>();

    const insert = tx.insert(schema.jobs).values(values);
    const withConflict =
      input.onConflict?.action === "doNothing"
        ? insert.onConflictDoNothing({ target: schema.jobs.id })
        : input.onConflict?.action === "doUpdate"
          ? insert.onConflictDoUpdate({ target: schema.jobs.id, set: input.onConflict.set })
          : insert;
    const inserted = (await withConflict.returning({
      ...fields,
      ...trackedColumns,
    })) as (TrackedRow & Record<string, unknown>)[];
    await recordChanges(tx, inserted, previousById, "insert");
    return inserted;
  });

  return input.returning ? rows.map((row) => splitRow(row, fields)) : undefined;
}
