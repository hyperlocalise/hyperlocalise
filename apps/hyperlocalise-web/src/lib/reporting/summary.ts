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
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

/**
 * The version of the daily summary's rules. A workspace whose summary was built under another
 * version is rebuilt in full, so raising this is how a change to the rules reaches old days.
 */
export const SUMMARY_VERSION = 1;

export type SummaryMark = { projectId: string | null; day: string };

/** The UTC day a recorded time falls on, as the summary stores it. */
export function summaryDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Marks workspace, project and day for its summary rows to be worked out again. Called last
 * inside the transaction of the write it follows, so the mark commits with the write.
 */
export async function markSummaryDays(
  database: DatabaseClient,
  organizationId: string,
  marks: SummaryMark[],
) {
  const unique = new Map<string, { projectId: string; day: string }>();
  for (const { projectId, day } of marks) {
    if (projectId) unique.set(`${projectId}\u0000${day}`, { projectId, day });
  }
  if (unique.size === 0) return;
  // A stable order, so two writes marking the same days lock the queue rows in the same order.
  const rows = [...unique.values()].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) || left.day.localeCompare(right.day),
  );
  await database
    .insert(schema.reportingSummaryQueue)
    .values(rows.map((row) => ({ organizationId, projectId: row.projectId, day: row.day })))
    .onConflictDoUpdate({
      target: [
        schema.reportingSummaryQueue.organizationId,
        schema.reportingSummaryQueue.projectId,
        schema.reportingSummaryQueue.day,
      ],
      set: {
        generation: sql`${schema.reportingSummaryQueue.generation} + 1`,
        markedAt: sql`now()`,
      },
    });
}

const UNITS = [
  ["words", "coalesce(words, 0)"],
  ["strings", "1"],
  ["characters", "coalesce(characters, 0)"],
  ["characters_with_spaces", "coalesce(characters_with_spaces, 0)"],
] as const;

/**
 * Every summary measure, with how an arrival (a current analysis) and a finished string (a
 * completion) count towards it. Arrivals see `representative`, `done` and the analysis's counts;
 * finished strings see `by_person` and the counts of the analysis they finished.
 */
const MEASURES: { column: string; arrival: string; finished: string }[] = [
  ...UNITS.map(([unit, value]) => ({
    column: `source_${unit}`,
    arrival: `case when representative then ${value} else 0 end`,
    finished: "0",
  })),
  ...UNITS.map(([unit, value]) => ({ column: `arrived_${unit}`, arrival: value, finished: "0" })),
  {
    column: "arrived_uncounted",
    arrival: "case when words is null then 1 else 0 end",
    finished: "0",
  },
  ...UNITS.map(([unit, value]) => ({
    column: `arrived_done_${unit}`,
    arrival: `case when done then ${value} else 0 end`,
    finished: "0",
  })),
  ...UNITS.map(([unit, value]) => ({ column: `finished_${unit}`, arrival: "0", finished: value })),
  ...UNITS.map(([unit, value]) => ({
    column: `finished_by_person_${unit}`,
    arrival: "0",
    finished: `case when by_person then ${value} else 0 end`,
  })),
];
const MEASURE_COLUMNS = MEASURES.map((measure) => measure.column).join(", ");
const MEASURE_SUMS = MEASURES.map((measure) => `sum(${measure.column})::integer`).join(", ");
const ARRIVAL_MEASURES = MEASURES.map((m) => `${m.arrival} as ${m.column}`).join(", ");
const FINISHED_MEASURES = MEASURES.map((m) => `${m.finished} as ${m.column}`).join(", ");

/** Days refreshed in one statement for one project: a first build is a year at most. */
const MAX_DAYS_PER_REFRESH = 400;
/**
 * Above this many strings arriving in the refreshed days, their completions are found by scanning
 * the project's completions rather than one key lookup each (measured on a 380,000-string day:
 * 1.7 s against 3.8 s; on a 429-string day the lookups took 27 ms against 300 ms).
 */
const SCAN_COMPLETIONS_ABOVE = 20_000;

/**
 * Works out the summary rows of one workspace and project again for the given UTC days, from the
 * raw rows, in one statement per table, and removes each day's mark unless a write marked it
 * again meanwhile. Returns "busy" without waiting when another refresh of the project holds it.
 */
export async function refreshSummaryDays(
  input: {
    organizationId: string;
    projectId: string;
    days: string[];
    /** Overrides `SCAN_COMPLETIONS_ABOVE`, so tests can check both ways give the same rows. */
    scanCompletionsAbove?: number;
  },
  database: DatabaseClient = db,
): Promise<"refreshed" | "busy"> {
  const { organizationId, projectId } = input;
  const days = [...new Set(input.days)].sort();
  if (days.length === 0) return "refreshed";
  return database.transaction(async (tx) => {
    const lockKey = `reporting-summary:${organizationId}:${projectId}`;
    const [lock] = (
      await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as locked`,
      )
    ).rows;
    if (!lock?.locked) return "busy";
    const queued = await tx
      .select({
        day: schema.reportingSummaryQueue.day,
        generation: schema.reportingSummaryQueue.generation,
      })
      .from(schema.reportingSummaryQueue)
      .where(
        and(
          eq(schema.reportingSummaryQueue.organizationId, organizationId),
          eq(schema.reportingSummaryQueue.projectId, projectId),
          inArray(schema.reportingSummaryQueue.day, days),
        ),
      );
    const dayList = sql`${`{${days.join(",")}}`}::date[]`;
    // The index covers the range from the first to the last day; the list then picks the
    // marked days inside it.
    const inDays = (column: string) => {
      const at = sql.raw(column);
      return sql`${at} >= (${days[0]}::date::timestamp at time zone 'UTC')
        and ${at} < ((${days[days.length - 1]}::date + 1)::timestamp at time zone 'UTC')
        and (${at} at time zone 'UTC')::date = any(${dayList})`;
    };
    await tx
      .delete(schema.reportingDailyByTask)
      .where(
        and(
          eq(schema.reportingDailyByTask.organizationId, organizationId),
          eq(schema.reportingDailyByTask.projectId, projectId),
          inArray(schema.reportingDailyByTask.day, days),
        ),
      );
    // A day can hold a whole first import (hundreds of thousands of rows), where looking each
    // row's completion up by its key takes seconds; scanning the project's completions once is
    // then faster. For an ordinary day the key lookups are, by far.
    const [arrivalCount] = (
      await tx.execute<{ rows: number }>(sql`
        select count(*)::integer as rows from reporting_analyses a
        where a.organization_id = ${organizationId} and a.project_id = ${projectId}
          and a.is_current and ${inDays("a.created_at")}
      `)
    ).rows;
    const completionsOfArrivals =
      (arrivalCount?.rows ?? 0) > (input.scanCompletionsAbove ?? SCAN_COMPLETIONS_ABOVE)
        ? sql`select d.analysis_id from reporting_activity d
            where d.organization_id = ${organizationId} and d.project_id = ${projectId}
              and d.kind = 'completion' and d.analysis_id in (select id from arrivals)`
        : sql`select d.analysis_id from reporting_activity d
            where d.organization_id = ${organizationId}
              and d.operation_key in (select 'completion:' || id || ':' || step from arrivals)`;
    await tx.execute(sql`
      with arrivals as materialized (
        select a.* from reporting_analyses a
        where a.organization_id = ${organizationId} and a.project_id = ${projectId}
          and a.is_current and ${inDays("a.created_at")}
      ),
      -- Source counts each text once however many languages it goes into: only on the earliest
      -- current analysis of the same task, string, text and step.
      firsts as (
        select distinct on (o.job_id, o.segment_id, o.source_revision, o.step) o.id
        from reporting_analyses o
        where o.organization_id = ${organizationId} and o.is_current and o.project_id is not null
          and o.segment_id in (select segment_id from arrivals)
        order by o.job_id, o.segment_id, o.source_revision, o.step, o.created_at, o.target_locale, o.id
      ),
      done as (${completionsOfArrivals})
      insert into reporting_daily_by_task (organization_id, project_id, job_id, source_locale,
        target_locale, step, bucket, payable, day, ${sql.raw(MEASURE_COLUMNS)})
      select ${organizationId}, ${projectId}, job_id, source_locale, target_locale, step, bucket,
        payable, day, ${sql.raw(MEASURE_SUMS)}
      from (
        select a.job_id, a.source_locale, a.target_locale, a.step, a.bucket, a.billable as payable,
          (a.created_at at time zone 'UTC')::date as day, ${sql.raw(ARRIVAL_MEASURES)}
        from (
          select a.*, d.analysis_id is not null as done, f.id is not null as representative
          from arrivals a
          left join firsts f on f.id = a.id
          left join (select distinct analysis_id from done) d on d.analysis_id = a.id
        ) a
        union all
        select f.job_id, f.source_locale, f.target_locale, f.step, f.bucket, f.payable, f.day,
          ${sql.raw(FINISHED_MEASURES)}
        from (
          select s.job_id, s.source_locale, c.target_locale, c.step, s.bucket,
            s.billable as payable, (c.created_at at time zone 'UTC')::date as day, s.words,
            s.characters, s.characters_with_spaces, c.actor_user_id is not null as by_person
          from reporting_activity c join reporting_analyses s on s.id = c.analysis_id
          where c.organization_id = ${organizationId} and c.project_id = ${projectId}
            and c.kind = 'completion' and ${inDays("c.created_at")}
        ) f
      ) facts
      group by job_id, source_locale, target_locale, step, bucket, payable, day
    `);
    await tx
      .delete(schema.reportingDailyByProject)
      .where(
        and(
          eq(schema.reportingDailyByProject.organizationId, organizationId),
          eq(schema.reportingDailyByProject.projectId, projectId),
          inArray(schema.reportingDailyByProject.day, days),
        ),
      );
    await tx.execute(sql`
      insert into reporting_daily_by_project (organization_id, project_id, target_locale, step,
        bucket, day, ${sql.raw(MEASURE_COLUMNS)})
      select organization_id, project_id, target_locale, step, bucket, day, ${sql.raw(MEASURE_SUMS)}
      from reporting_daily_by_task
      where organization_id = ${organizationId} and project_id = ${projectId}
        and day = any(${dayList})
      group by organization_id, project_id, target_locale, step, bucket, day
    `);
    // A write that marked a day while this ran bumped its generation: keep that mark.
    for (const mark of queued) {
      await tx
        .delete(schema.reportingSummaryQueue)
        .where(
          and(
            eq(schema.reportingSummaryQueue.organizationId, organizationId),
            eq(schema.reportingSummaryQueue.projectId, projectId),
            eq(schema.reportingSummaryQueue.day, mark.day),
            eq(schema.reportingSummaryQueue.generation, mark.generation),
          ),
        );
    }
    return "refreshed";
  });
}

/** `refreshSummaryDays` for a single day. */
export async function refreshSummaryDay(
  input: { organizationId: string; projectId: string; day: string },
  database: DatabaseClient = db,
): Promise<"refreshed" | "busy"> {
  return refreshSummaryDays({ ...input, days: [input.day] }, database);
}

export type SummaryRefreshResult = {
  daysRefreshed: number;
  projectsSkipped: number;
  daysPending: number;
  workspacesQueuedForBuild: number;
};

/**
 * Refreshes marked days until none are left or `signal` fires: the project with the oldest mark
 * first, all of its marked days at once (up to `MAX_DAYS_PER_REFRESH`).
 */
export async function refreshPendingSummary(
  input: { signal?: AbortSignal; organizationIds?: string[]; scanCompletionsAbove?: number } = {},
): Promise<Omit<SummaryRefreshResult, "workspacesQueuedForBuild">> {
  let daysRefreshed = 0;
  const skipped = new Set<string>();
  const scope = input.organizationIds
    ? sql`and organization_id in (${sql.join(
        input.organizationIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  for (;;) {
    if (input.signal?.aborted) break;
    const projects = (
      await db.execute<{ organizationId: string; projectId: string }>(sql`
        select organization_id as "organizationId", project_id as "projectId"
        from reporting_summary_queue where true ${scope}
        group by organization_id, project_id order by min(marked_at)
        limit ${skipped.size + 1}
      `)
    ).rows.filter((project) => !skipped.has(`${project.organizationId}:${project.projectId}`));
    const next = projects[0];
    if (!next) break;
    const marks = await db
      .select({ day: schema.reportingSummaryQueue.day })
      .from(schema.reportingSummaryQueue)
      .where(
        and(
          eq(schema.reportingSummaryQueue.organizationId, next.organizationId),
          eq(schema.reportingSummaryQueue.projectId, next.projectId),
        ),
      )
      .orderBy(asc(schema.reportingSummaryQueue.markedAt))
      .limit(MAX_DAYS_PER_REFRESH);
    const outcome = await refreshSummaryDays({
      ...next,
      days: marks.map((mark) => mark.day),
      scanCompletionsAbove: input.scanCompletionsAbove,
    });
    if (outcome === "refreshed") daysRefreshed += marks.length;
    else skipped.add(`${next.organizationId}:${next.projectId}`);
  }
  const [pending] = (
    await db.execute<{ count: number }>(
      sql`select count(*)::integer as count from reporting_summary_queue`,
    )
  ).rows;
  return { daysRefreshed, projectsSkipped: skipped.size, daysPending: pending?.count ?? 0 };
}

/**
 * Queues every day of a workspace whose summary was never built, or was built under another
 * `SUMMARY_VERSION`, so the refresh builds it. A workspace gets its `reporting_workspaces` row
 * the first time Reports records anything for it.
 */
export async function ensureSummaryBuilt(input: { organizationIds?: string[] } = {}) {
  const workspaces = await db
    .select({ organizationId: schema.reportingWorkspaces.organizationId })
    .from(schema.reportingWorkspaces)
    .where(
      and(
        or(
          isNull(schema.reportingWorkspaces.summaryVersion),
          ne(schema.reportingWorkspaces.summaryVersion, SUMMARY_VERSION),
        ),
        input.organizationIds
          ? sql`${schema.reportingWorkspaces.organizationId} in (${sql.join(
              input.organizationIds.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : undefined,
      ),
    );
  for (const { organizationId } of workspaces) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into reporting_summary_queue (organization_id, project_id, day)
        select ${organizationId}, project_id, day from (
          select project_id, (created_at at time zone 'UTC')::date as day from reporting_analyses
          where organization_id = ${organizationId} and project_id is not null
          union
          select project_id, (created_at at time zone 'UTC')::date from reporting_activity
          where organization_id = ${organizationId} and kind = 'completion' and project_id is not null
        ) days
        on conflict (organization_id, project_id, day) do update
          set generation = reporting_summary_queue.generation + 1, marked_at = now()
      `);
      await tx
        .update(schema.reportingWorkspaces)
        .set({ summaryVersion: SUMMARY_VERSION })
        .where(eq(schema.reportingWorkspaces.organizationId, organizationId));
    });
  }
  return workspaces.length;
}

/** Builds what is missing, then refreshes marked days, within `signal`'s time. */
export async function refreshReportingSummary(
  input: { signal?: AbortSignal } = {},
): Promise<SummaryRefreshResult> {
  const workspacesQueuedForBuild = await ensureSummaryBuilt();
  const refreshed = await refreshPendingSummary({ signal: input.signal });
  return { ...refreshed, workspacesQueuedForBuild };
}

/**
 * Whether days are refreshed straight after the write that marks them, rather than only by the
 * scheduled capture run. Undecided as a product setting, so it is read from the environment.
 */
export function refreshesAfterWrite() {
  return process.env.REPORTING_SUMMARY_REFRESH === "after_write";
}

/** Refreshes the days a write just marked, when `refreshesAfterWrite` is on; never throws. */
export async function refreshMarkedDays(organizationId: string, marks: SummaryMark[]) {
  if (!refreshesAfterWrite()) return;
  const daysByProject = new Map<string, string[]>();
  for (const mark of marks) {
    if (mark.projectId)
      daysByProject.set(mark.projectId, [...(daysByProject.get(mark.projectId) ?? []), mark.day]);
  }
  for (const [projectId, days] of daysByProject) {
    try {
      await refreshSummaryDays({ organizationId, projectId, days });
    } catch (error) {
      console.warn("reporting_summary_refresh_failed", { organizationId, error });
    }
  }
}
