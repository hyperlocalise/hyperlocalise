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
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/database/client";

import type { ReportPeriod } from "./report-period";
import { idList, jobTitle, scopedProjectIds, type ReportScope } from "./report-scope";
import {
  REPORT_STEPS,
  SUMMARY_SOURCES,
  type ReportStep,
  type ReportUnit,
  type SummarySource,
} from "./report-units";
import { MATCH_BUCKETS, type MatchBucket } from "./word-analysis";

/**
 * Word counts for the Reports page, read from the daily summary (`summary.ts`) only. Sums are
 * read as `float8` so a large workspace's totals cannot overflow a 32-bit integer.
 */

type SummaryMeasure =
  | "source"
  | "arrived"
  | "arrived_done"
  | "abandoned"
  | "finished"
  | "finished_by_person"
  | "finished_unchanged";

/** A summary column, such as `arrived_words`. Both parts are fixed lists, never user text. */
function measure(name: SummaryMeasure, unit: ReportUnit): SQL {
  return sql.raw(`s.${name}_${unit}`);
}

/**
 * Rows whose finished text came from a source. A summary built before sources were recorded
 * holds finished units on rows keyed "", which count as not recorded.
 */
function sourceIs(name: SummarySource): SQL {
  return name === "unknown" ? sql`s.source in ('unknown', '')` : sql`s.source = ${name}`;
}

/**
 * The summary rows a section reads: by project unless a task is chosen, since only the by-task
 * table has tasks. Returns null when the viewer can open none of the chosen projects.
 */
function summarySource(scope: ReportScope): { table: SQL; where: SQL } | null {
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return null;
  const byTask = (scope.jobIds?.length ?? 0) > 0;
  return {
    table: sql.raw(byTask ? "reporting_daily_by_task s" : "reporting_daily_by_project s"),
    where: sql`s.organization_id = ${scope.organizationId}
      and s.project_id in (${idList(projectIds)})
      ${byTask ? sql`and s.job_id in (${idList(scope.jobIds!)})` : sql``}
      ${scope.targetLocale ? sql`and s.target_locale = ${scope.targetLocale}` : sql``}`,
  };
}

export type ActivityTotals = {
  /** Source units that arrived, each text counted once however many languages it goes into. */
  source: number;
  /** Units that arrived to translate: the current version of each string, per language. */
  arrived: number;
  /** The part of `arrived` finished since. */
  arrivedDone: number;
  /**
   * The part of `arrived` not finished and held by no open task (its task failed, was cancelled
   * or deleted): work that will not happen, which Progress leaves out of what it divides by.
   */
  abandoned: number;
  /** Units translated (every finished record). */
  finished: number;
  /** Units reviewed (every finished review record). */
  reviewed: number;
  /** Strings that arrived whose units could not be counted. */
  uncounted: number;
  /** The part of `finished` a person did. */
  finishedByPerson: number;
  /** The part of `finishedByPerson` where the person kept the text they were given. */
  finishedUnchanged: number;
  /** `finished` by where the text came from. */
  finishedBySource: Record<SummarySource, number>;
};

export const NO_SOURCES: Record<SummarySource, number> = {
  memory: 0,
  ai: 0,
  person: 0,
  import: 0,
  unknown: 0,
};

const NO_ACTIVITY: ActivityTotals = {
  source: 0,
  arrived: 0,
  arrivedDone: 0,
  abandoned: 0,
  finished: 0,
  reviewed: 0,
  uncounted: 0,
  finishedByPerson: 0,
  finishedUnchanged: 0,
  finishedBySource: NO_SOURCES,
};

/** The Activity tab's headline totals for a period and the period before it, in one scan. */
export async function queryActivity(
  input: ReportScope & { period: ReportPeriod; unit: ReportUnit },
): Promise<{ current: ActivityTotals; previous: ActivityTotals }> {
  const source = summarySource(input);
  if (!source) return { current: NO_ACTIVITY, previous: NO_ACTIVITY };
  const totals = (current: boolean) => {
    const inPeriod = current
      ? sql`s.day >= ${input.period.from}`
      : sql`s.day <= ${input.period.previousTo}`;
    const translation = sql`s.step = 'translation' and ${inPeriod}`;
    const column = (name: SummaryMeasure, filter: SQL) =>
      sql`coalesce(sum(${measure(name, input.unit)}) filter (where ${filter}), 0)::float8`;
    return sql`json_build_object(
      'source', ${column("source", translation)},
      'arrived', ${column("arrived", translation)},
      'arrivedDone', ${column("arrived_done", translation)},
      'abandoned', ${column("abandoned", translation)},
      'finished', ${column("finished", translation)},
      'reviewed', ${column("finished", sql`s.step = 'review' and ${inPeriod}`)},
      'uncounted', coalesce(sum(s.arrived_uncounted) filter (where ${translation}), 0)::float8,
      'finishedByPerson', ${column("finished_by_person", translation)},
      'finishedUnchanged', ${column("finished_unchanged", translation)},
      -- The names are a fixed list, never user text; as literals, since a parameter has no type a JSON key can take.
      'finishedBySource', json_build_object(${sql.join(
        SUMMARY_SOURCES.map(
          (name) =>
            sql`${sql.raw(`'${name}'`)}, ${column("finished", sql`${translation} and ${sourceIs(name)}`)}`,
        ),
        sql`, `,
      )})
    )`;
  };
  const result = await db.execute<{ current: ActivityTotals; previous: ActivityTotals }>(sql`
    select ${totals(true)} as current, ${totals(false)} as previous
    from ${source.table}
    where ${source.where} and s.day between ${input.period.previousFrom} and ${input.period.to}
  `);
  return result.rows[0];
}

export type FinishedSeriesPoint = { start: string } & Record<SummarySource, number>;

/**
 * Units finished in each day or week of a period, split by where the text came from. Every day
 * or week is present, with zeros where nothing was finished; a week starts on Monday, so the
 * first may begin before the period does.
 */
export async function queryFinishedSeries(
  input: ReportScope & { period: ReportPeriod; unit: ReportUnit; step: ReportStep },
): Promise<FinishedSeriesPoint[]> {
  const weekly = input.period.interval === "week";
  const bucket = weekly ? sql`date_trunc('week', s.day)::date` : sql`s.day`;
  const first = weekly
    ? sql`date_trunc('week', ${input.period.from}::date)`
    : sql`${input.period.from}::date`;
  const source = summarySource(input);
  const bySource = (name: SummarySource) =>
    sql`sum(${measure("finished", input.unit)}) filter (where ${sourceIs(name)})`;
  const totals = source
    ? sql`select ${bucket} as start,
          ${sql.join(
            SUMMARY_SOURCES.map((name) => sql`${bySource(name)} as ${sql.raw(name)}`),
            sql`, `,
          )}
        from ${source.table}
        where ${source.where} and s.step = ${input.step}
          and s.day between ${input.period.from} and ${input.period.to}
        group by 1`
    : sql`select null::date as start,
        ${sql.join(
          SUMMARY_SOURCES.map((name) => sql`0 as ${sql.raw(name)}`),
          sql`, `,
        )} where false`;
  const result = await db.execute<FinishedSeriesPoint>(sql`
    with totals as (${totals})
    select b.start::date::text as start,
      ${sql.join(
        SUMMARY_SOURCES.map(
          (name) => sql`coalesce(t.${sql.raw(name)}, 0)::float8 as ${sql.raw(name)}`,
        ),
        sql`, `,
      )}
    from generate_series(${first}, ${input.period.to}::date, ${weekly ? "7 days" : "1 day"}::interval) b(start)
    left join totals t on t.start = b.start::date
    order by b.start
  `);
  return result.rows;
}

export type FinishedLanguage = { targetLocale: string; units: number };

/** Units finished in a period by target language, largest first. */
export async function queryFinishedByLanguage(
  input: ReportScope & { period: ReportPeriod; unit: ReportUnit; step: ReportStep },
): Promise<FinishedLanguage[]> {
  const source = summarySource(input);
  if (!source) return [];
  const result = await db.execute<FinishedLanguage>(sql`
    select s.target_locale as "targetLocale", sum(${measure("finished", input.unit)})::float8 as units
    from ${source.table}
    where ${source.where} and s.step = ${input.step}
      and s.day between ${input.period.from} and ${input.period.to}
    group by 1 having sum(${measure("finished", input.unit)}) > 0
    order by 2 desc, 1
  `);
  return result.rows;
}

export type BandCounts = Partial<Record<MatchBucket, number>>;

export type WordCountRow = {
  projectId: string | null;
  projectName: string | null;
  /** Null for work saved in the content editor outside any task. */
  jobId: string | null;
  /** Null when the task was deleted. */
  jobTitle: string | null;
  targetLocale: string;
  bands: BandCounts;
  total: number;
};

export type WordCounts = {
  rows: WordCountRow[];
  bandTotals: BandCounts;
  total: number;
  /** Strings that arrived whose units could not be counted (only for `mode: "arrived"`). */
  uncounted: number;
  /** Tasks across every page when grouped by task; projects when grouped by project. */
  groupCount: number;
  page: number;
  pageSize: number;
};

export const WORD_COUNT_PAGE_SIZE = 50;

/**
 * Units that arrived, or were finished, in a period, by match band and target language, grouped
 * by project or by task. Tasks come largest first, a page of 50 at a time; totals cover every
 * page.
 */
export async function queryWordCounts(
  input: ReportScope & {
    period: ReportPeriod;
    unit: ReportUnit;
    step: ReportStep;
    mode: "arrived" | "finished";
    groupBy: "project" | "task";
    page: number;
    /** Every task on one page, for a download. */
    all?: boolean;
  },
): Promise<WordCounts> {
  const empty: WordCounts = {
    rows: [],
    bandTotals: {},
    total: 0,
    uncounted: 0,
    groupCount: 0,
    page: input.page,
    pageSize: WORD_COUNT_PAGE_SIZE,
  };
  const projectIds = scopedProjectIds(input);
  if (projectIds.length === 0) return empty;
  const column = measure(input.mode, input.unit);
  const filters = sql`s.organization_id = ${input.organizationId}
    and s.project_id in (${idList(projectIds)})
    ${input.jobIds?.length ? sql`and s.job_id in (${idList(input.jobIds)})` : sql``}
    ${input.targetLocale ? sql`and s.target_locale = ${input.targetLocale}` : sql``}
    and s.step = ${input.step}
    and s.day between ${input.period.from} and ${input.period.to}`;
  // Totals over every task can come from the smaller by-project table unless tasks are chosen.
  const totalsTable = sql.raw(
    input.jobIds?.length ? "reporting_daily_by_task s" : "reporting_daily_by_project s",
  );
  // Read from a `bands` table of bucket, units and uncounted strings.
  const bandColumns = sql`
    (select json_object_agg(bucket, units::float8) filter (where units > 0) from bands)
      as "bandTotals",
    (select coalesce(sum(uncounted), 0) from bands)::float8 as uncounted`;
  const pageLimit = input.all
    ? sql``
    : sql`limit ${WORD_COUNT_PAGE_SIZE} offset ${(input.page - 1) * WORD_COUNT_PAGE_SIZE}`;
  const result = await db.execute<{
    groupCount: number;
    bandTotals: BandCounts | null;
    uncounted: number;
    rows: {
      projectId: string | null;
      jobId: string | null;
      targetLocale: string;
      bucket: MatchBucket;
      units: number;
    }[];
  }>(
    input.groupBy === "project"
      ? sql`
        with grouped as (
          select s.project_id, s.target_locale, s.bucket, sum(${column}) as units,
            sum(s.arrived_uncounted) as uncounted
          from ${totalsTable} where ${filters}
          group by 1, 2, 3
        ), bands as (
          select bucket, sum(units) as units, sum(uncounted) as uncounted from grouped group by 1
        )
        select (select count(*) from (
            select project_id from grouped group by 1 having sum(units) > 0
          ) projects)::integer as "groupCount", ${bandColumns},
          (select coalesce(json_agg(json_build_object(
              'projectId', g.project_id, 'jobId', null, 'targetLocale', g.target_locale,
              'bucket', g.bucket, 'units', g.units::float8
            )), '[]') from grouped g where g.units > 0) as rows`
      : // Tasks are ranked by a total each, and only the page's tasks are read in full, task by
        // task through the summary's task index.
        sql`
        with task_totals as (
          select s.job_id, sum(${column}) as total from reporting_daily_by_task s where ${filters}
          group by 1 having sum(${column}) > 0
        ), page as (
          select job_id, total from task_totals order by total desc, job_id nulls first ${pageLimit}
        ), page_rows as (
          select s.job_id, s.project_id, s.target_locale, s.bucket, sum(${column}) as units
          from page p cross join lateral (
            select s.* from reporting_daily_by_task s where s.job_id = p.job_id and ${filters}
            offset 0
          ) s
          group by 1, 2, 3, 4
          union all
          select null, s.project_id, s.target_locale, s.bucket, sum(${column})
          from reporting_daily_by_task s
          where exists (select 1 from page where job_id is null) and s.job_id is null and ${filters}
          group by 2, 3, 4
        ), bands as (
          select s.bucket, sum(${column}) as units, sum(s.arrived_uncounted) as uncounted
          from ${totalsTable} where ${filters} group by 1
        )
        select (select count(*) from task_totals)::integer as "groupCount", ${bandColumns},
          (select coalesce(json_agg(json_build_object(
              'projectId', r.project_id, 'jobId', r.job_id, 'targetLocale', r.target_locale,
              'bucket', r.bucket, 'units', r.units::float8
            ) order by p.total desc, p.job_id nulls first), '[]')
            from page_rows r join page p on p.job_id is not distinct from r.job_id
            where r.units > 0) as rows`,
  );
  const { groupCount, bandTotals, uncounted, rows } = result.rows[0];
  const names = await groupNames(rows);
  const merged = new Map<string, WordCountRow>();
  for (const row of rows) {
    const key = `${row.jobId ?? ""}\u0000${row.projectId}\u0000${row.targetLocale}`;
    let entry = merged.get(key);
    if (!entry) {
      entry = {
        projectId: row.projectId,
        projectName: null,
        jobId: row.jobId,
        jobTitle: row.jobId ? (names.jobTitles.get(row.jobId) ?? null) : null,
        targetLocale: row.targetLocale,
        bands: {},
        total: 0,
      };
      merged.set(key, entry);
    }
    entry.bands[row.bucket] = (entry.bands[row.bucket] ?? 0) + row.units;
    entry.total += row.units;
  }
  const ordered = [...merged.values()].map((row) => ({
    ...row,
    projectName: row.projectId ? (names.projectNames.get(row.projectId) ?? null) : null,
  }));
  if (input.groupBy === "project")
    ordered.sort(
      (left, right) =>
        (left.projectName ?? "").localeCompare(right.projectName ?? "") ||
        left.targetLocale.localeCompare(right.targetLocale),
    );
  const totals = bandTotals ?? {};
  return {
    rows: ordered,
    bandTotals: totals,
    total: MATCH_BUCKETS.reduce((sum, bucket) => sum + (totals[bucket] ?? 0), 0),
    uncounted: input.mode === "arrived" ? uncounted : 0,
    groupCount,
    page: input.page,
    pageSize: input.groupBy === "task" && !input.all ? WORD_COUNT_PAGE_SIZE : groupCount,
  };
}

async function groupNames(rows: { projectId: string | null; jobId: string | null }[]) {
  const jobIds = [...new Set(rows.flatMap((row) => (row.jobId ? [row.jobId] : [])))];
  const jobs = jobIds.length
    ? (
        await db.execute<{ id: string; title: string }>(sql`
          select j.id, ${jobTitle("j")} as title from jobs j where j.id in (${idList(jobIds)})
        `)
      ).rows
    : [];
  const projectIds = [...new Set(rows.flatMap((row) => (row.projectId ? [row.projectId] : [])))];
  const projects = projectIds.length
    ? (
        await db.execute<{ id: string; name: string }>(sql`
          select id, name from projects where id in (${idList(projectIds)})
        `)
      ).rows
    : [];
  return {
    jobTitles: new Map(jobs.map((job) => [job.id, job.title])),
    projectNames: new Map(projects.map((project) => [project.id, project.name])),
  };
}

export type TaskWordRow = {
  targetLocale: string;
  step: ReportStep;
  /** Units to do in each band: the current version of each of the task's strings. */
  bands: BandCounts;
  total: number;
  /** The part of `total` finished. */
  finished: number;
};

export type TaskWordTotals = {
  source: number;
  arrived: number;
  arrivedDone: number;
  uncounted: number;
};

/** A task's units by language, step and match band, over its whole life. */
export async function queryTaskWords(input: {
  organizationId: string;
  jobId: string;
  unit: ReportUnit;
}): Promise<{ rows: TaskWordRow[]; totals: Record<ReportStep, TaskWordTotals> }> {
  const result = await db.execute<{
    targetLocale: string;
    step: ReportStep;
    bucket: MatchBucket;
    source: number;
    arrived: number;
    arrivedDone: number;
    uncounted: number;
  }>(sql`
    select s.target_locale as "targetLocale", s.step, s.bucket,
      sum(${measure("source", input.unit)})::float8 as source,
      sum(${measure("arrived", input.unit)})::float8 as arrived,
      sum(${measure("arrived_done", input.unit)})::float8 as "arrivedDone",
      sum(s.arrived_uncounted)::float8 as uncounted
    from reporting_daily_by_task s
    where s.organization_id = ${input.organizationId} and s.job_id = ${input.jobId}
    group by 1, 2, 3
  `);
  const totals: Record<ReportStep, TaskWordTotals> = {
    translation: { source: 0, arrived: 0, arrivedDone: 0, uncounted: 0 },
    review: { source: 0, arrived: 0, arrivedDone: 0, uncounted: 0 },
  };
  const rows = new Map<string, TaskWordRow>();
  for (const row of result.rows) {
    const total = totals[row.step];
    total.source += row.source;
    total.arrived += row.arrived;
    total.arrivedDone += row.arrivedDone;
    total.uncounted += row.uncounted;
    const key = `${row.targetLocale}\u0000${row.step}`;
    let entry = rows.get(key);
    if (!entry) {
      entry = { targetLocale: row.targetLocale, step: row.step, bands: {}, total: 0, finished: 0 };
      rows.set(key, entry);
    }
    if (row.arrived > 0) entry.bands[row.bucket] = (entry.bands[row.bucket] ?? 0) + row.arrived;
    entry.total += row.arrived;
    entry.finished += row.arrivedDone;
  }
  return {
    rows: [...rows.values()].sort(
      (left, right) =>
        REPORT_STEPS.indexOf(left.step) - REPORT_STEPS.indexOf(right.step) ||
        left.targetLocale.localeCompare(right.targetLocale),
    ),
    totals,
  };
}
