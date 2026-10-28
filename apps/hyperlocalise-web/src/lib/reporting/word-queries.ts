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
  BAND_TIER_OF,
  BAND_TIER_ORDER,
  WORD_TASK_STEPS,
  type ReportStep,
  type ReportUnit,
  type SummarySource,
  type WordCountGrouping,
  type WordCountInterval,
  type WordCountSplit,
  type WordTaskStep,
} from "./report-units";
import { taskStepSql } from "./time-queries";
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

/** Rows whose finished text came from a source; rows keyed "" hold arrivals only. */
function sourceIs(name: SummarySource): SQL {
  return sql`s.source = ${name}`;
}

/**
 * The summary rows a section reads: by project unless a task is chosen or `byTask` is asked for,
 * since only the by-task table has tasks. Returns null when the viewer can open none of the
 * chosen projects.
 */
function summarySource(
  scope: ReportScope,
  options: { byTask?: boolean } = {},
): { table: SQL; where: SQL } | null {
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return null;
  const jobIds = scope.jobIds ?? [];
  const byTask = options.byTask || jobIds.length > 0;
  return {
    table: sql.raw(byTask ? "reporting_daily_by_task s" : "reporting_daily_by_project s"),
    where: sql`s.organization_id = ${scope.organizationId}
      and s.project_id in (${idList(projectIds)})
      ${jobIds.length > 0 ? sql`and s.job_id in (${idList(jobIds)})` : sql``}
      ${scope.targetLocale ? sql`and s.target_locale = ${scope.targetLocale}` : sql``}`,
  };
}

/**
 * What a by-task summary row's task is for; rows outside any task are `no_task`. A deleted
 * task's work goes by the pricing step the rows are read for: review as proofread, the plain
 * review task, and translation as translate.
 */
function wordTaskStepSql(step: ReportStep): SQL {
  const deleted = step === "review" ? "proofread" : "translate";
  return sql`case when s.job_id is null then 'no_task'
    when j.id is null then ${deleted}::text else ${taskStepSql("j")} end`;
}

/**
 * The bars of a series over a period: each summary row's bar from its day, and every bar's
 * start, the first on or before the period's first day. Weeks start on Monday and months on
 * the first. Dates are stepped without a time zone, so the session's cannot move a day.
 */
function seriesBars(per: WordCountInterval, period: ReportPeriod) {
  const truncate = { day: null, week: "week", month: "month" }[per];
  const step = { day: "1 day", week: "7 days", month: "1 month" }[per];
  const first = truncate
    ? sql`date_trunc(${truncate}, ${period.from}::timestamp)`
    : sql`${period.from}::timestamp`;
  return {
    start: truncate ? sql`date_trunc(${truncate}, s.day::timestamp)::date` : sql`s.day`,
    starts: sql`generate_series(${first}, ${period.to}::timestamp, ${step}::interval)`,
  };
}

/** Joins a by-task summary row (`s`) to its task (`j`), for its task step; deleted tasks stay. */
const TASK_JOIN = sql`left join jobs j on j.id = s.job_id`;

export type ActivityTotals = {
  /**
   * Source units that arrived, each text counted once however many languages it goes into; under
   * a language filter, the units that arrived in that language.
   */
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
  /** The part of `finished` at `step` a person did. */
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

/**
 * The Activity tab's headline totals for a period and the period before it, in one scan. The
 * cards are about translation, apart from what was reviewed; what people finished, and kept as
 * given, follows `step`, the step the chart shows.
 */
export async function queryActivity(
  input: ReportScope & { period: ReportPeriod; unit: ReportUnit; step?: ReportStep },
): Promise<{ current: ActivityTotals; previous: ActivityTotals }> {
  const source = summarySource(input);
  if (!source) return { current: NO_ACTIVITY, previous: NO_ACTIVITY };
  const chartStep = input.step ?? "translation";
  const totals = (current: boolean) => {
    const inPeriod = current
      ? sql`s.day >= ${input.period.from}`
      : sql`s.day <= ${input.period.previousTo}`;
    const translation = sql`s.step = 'translation' and ${inPeriod}`;
    const shown = sql`s.step = ${chartStep} and ${inPeriod}`;
    const column = (name: SummaryMeasure, filter: SQL) =>
      sql`coalesce(sum(${measure(name, input.unit)}) filter (where ${filter}), 0)::float8`;
    return sql`json_build_object(
      -- Source words sit on each text's first language only, so under a language filter the
      -- language's arrivals are its source words.
      'source', ${column(input.targetLocale ? "arrived" : "source", translation)},
      'arrived', ${column("arrived", translation)},
      'arrivedDone', ${column("arrived_done", translation)},
      'abandoned', ${column("abandoned", translation)},
      'finished', ${column("finished", translation)},
      'reviewed', ${column("finished", sql`s.step = 'review' and ${inPeriod}`)},
      'uncounted', coalesce(sum(s.arrived_uncounted) filter (where ${translation}), 0)::float8,
      'finishedByPerson', ${column("finished_by_person", shown)},
      'finishedUnchanged', ${column("finished_unchanged", shown)},
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
  const bars = seriesBars(input.period.interval, input.period);
  const source = summarySource(input);
  const bySource = (name: SummarySource) =>
    sql`sum(${measure("finished", input.unit)}) filter (where ${sourceIs(name)})`;
  const totals = source
    ? sql`select ${bars.start} as start,
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
    from ${bars.starts} b(start)
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
  /** The Monday of the week, as a date, when grouped by week; null otherwise. */
  week: string | null;
  /** Null when grouped by language or by task step. */
  projectId: string | null;
  projectName: string | null;
  /** Null for work saved in the content editor outside any task, and unless grouped by task. */
  jobId: string | null;
  /** Null when the task was deleted. */
  jobTitle: string | null;
  /** What the work's task is for, when grouped by task step; null otherwise. */
  taskStep: WordTaskStep | null;
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
  /**
   * Tasks across every page when grouped by task; projects, weeks, languages or task steps for
   * the other groupings.
   */
  groupCount: number;
  page: number;
  pageSize: number;
};

export const WORD_COUNT_PAGE_SIZE = 50;

/**
 * Units that arrived, or were finished, in a period, by match band and target language, grouped
 * by project, by task, by week and project (the volume each week, as the old report showed it),
 * by language alone, or by task step. Tasks come largest first, a page of 50 at a time; totals
 * cover every page. Rows by task or by task step count a string in each task that holds it, so
 * they can add up to more than the totals, which count it once per project.
 */
export async function queryWordCounts(
  input: ReportScope & {
    period: ReportPeriod;
    unit: ReportUnit;
    step: ReportStep;
    mode: "arrived" | "finished";
    groupBy: WordCountGrouping;
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
  // Every grouping but by task is one grouping over a summary table: the totals table, or the
  // by-task table with each row's task for task steps.
  const weekly = input.groupBy === "week";
  const byTaskStep = input.groupBy === "task_step";
  const byProject = input.groupBy === "project" || weekly;
  // The column that counts as one group, for the group count.
  const groupKey = {
    project: "project_id",
    task: "job_id",
    week: "week",
    language: "target_locale",
    task_step: "task_step",
  }[input.groupBy];
  const result = await db.execute<{
    groupCount: number;
    bandTotals: BandCounts | null;
    uncounted: number;
    rows: {
      week: string | null;
      projectId: string | null;
      jobId: string | null;
      taskStep: WordTaskStep | null;
      targetLocale: string;
      bucket: MatchBucket;
      units: number;
    }[];
  }>(
    input.groupBy !== "task"
      ? sql`
        with grouped as (
          select ${weekly ? sql`date_trunc('week', s.day)::date` : sql`null::date`} as week,
            ${byProject ? sql`s.project_id` : sql`null::text`} as project_id,
            ${byTaskStep ? wordTaskStepSql(input.step) : sql`null::text`} as task_step,
            s.target_locale, s.bucket, sum(${column}) as units,
            sum(s.arrived_uncounted) as uncounted
          from ${byTaskStep ? sql`reporting_daily_by_task s ${TASK_JOIN}` : totalsTable}
          where ${filters}
          group by 1, 2, 3, 4, 5
        ), bands as (
          -- Task step rows count a string in each task that holds it; the totals, as By task's,
          -- count it once per project.
          ${
            byTaskStep
              ? sql`select s.bucket, sum(${column}) as units, sum(s.arrived_uncounted) as uncounted
                from ${totalsTable} where ${filters} group by 1`
              : sql`select bucket, sum(units) as units, sum(uncounted) as uncounted
                from grouped group by 1`
          }
        )
        select (select count(*) from (
            select ${sql.raw(groupKey)} from grouped group by 1
            having sum(units) > 0
          ) groups)::integer as "groupCount", ${bandColumns},
          (select coalesce(json_agg(json_build_object(
              'week', g.week::text, 'projectId', g.project_id, 'jobId', null,
              'taskStep', g.task_step, 'targetLocale', g.target_locale, 'bucket', g.bucket,
              'units', g.units::float8
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
              'week', null, 'projectId', r.project_id, 'jobId', r.job_id, 'taskStep', null,
              'targetLocale', r.target_locale, 'bucket', r.bucket, 'units', r.units::float8
            ) order by p.total desc, p.job_id nulls first), '[]')
            from page_rows r join page p on p.job_id is not distinct from r.job_id
            where r.units > 0) as rows`,
  );
  const { groupCount, bandTotals, uncounted, rows } = result.rows[0];
  const names = await groupNames(rows);
  const merged = new Map<string, WordCountRow>();
  for (const row of rows) {
    const key = [row.week, row.jobId, row.projectId, row.taskStep, row.targetLocale].join("\u0000");
    let entry = merged.get(key);
    if (!entry) {
      entry = {
        week: row.week,
        projectId: row.projectId,
        projectName: null,
        jobId: row.jobId,
        jobTitle: row.jobId ? (names.jobTitles.get(row.jobId) ?? null) : null,
        taskStep: row.taskStep,
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
  const stepOrder = (step: WordTaskStep | null) => (step ? WORD_TASK_STEPS.indexOf(step) : -1);
  if (input.groupBy !== "task")
    ordered.sort(
      (left, right) =>
        (left.week ?? "").localeCompare(right.week ?? "") ||
        (left.projectName ?? "").localeCompare(right.projectName ?? "") ||
        stepOrder(left.taskStep) - stepOrder(right.taskStep) ||
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

/** How many projects or languages the volume chart shows on their own; the rest are one "Other". */
export const WORD_COUNT_CHART_GROUPS = 5;

export type WordCountSeries = {
  split: WordCountSplit;
  per: WordCountInterval;
  /**
   * The series, bottom to top: the largest projects or languages over the period, largest
   * first, then "Other" when there are more; or each band tier or task step with units, in
   * their order. `key` is the project id, language, band tier or task step; `name` a project's.
   */
  groups: { key: string | null; name: string | null; other: boolean }[];
  /**
   * One point per day, week (its Monday) or month (its first day), as a date, with units in the
   * order of `groups`.
   */
  points: { start: string; units: number[] }[];
};

/**
 * Units that arrived, or were finished, each day, week or month of a period, split by project,
 * language, band tier or task step, with a point for every day, week or month even when nothing
 * happened. Weeks start on Monday and months on the first, in UTC, as the table's weeks do; the
 * first may begin before the period does. Split by task step, a string counts in each task that
 * holds it, as the table grouped by task step counts it.
 */
export async function queryWordCountSeries(
  input: ReportScope & {
    period: ReportPeriod;
    unit: ReportUnit;
    step: ReportStep;
    mode: "arrived" | "finished";
    split: WordCountSplit;
    per: WordCountInterval;
  },
): Promise<WordCountSeries> {
  const byTaskStep = input.split === "task_step";
  const source = summarySource(input, { byTask: byTaskStep });
  if (!source) return { split: input.split, per: input.per, groups: [], points: [] };
  const column = measure(input.mode, input.unit);
  const bars = seriesBars(input.per, input.period);
  const key = {
    project: sql`s.project_id`,
    language: sql`s.target_locale`,
    band: sql`s.bucket`,
    task_step: wordTaskStepSql(input.step),
  }[input.split];
  // Each row's task is joined for its step. Grouping by task first was faster over a year but
  // slower over 90 days, where its sort spilled to disk.
  const grouped = sql`grouped as (
    select ${bars.start} as start, ${key} as key, sum(${column}) as units
    from ${source.table} ${byTaskStep ? TASK_JOIN : sql``}
    where ${source.where} and s.step = ${input.step}
      and s.day between ${input.period.from} and ${input.period.to}
    group by 1, 2 having sum(${column}) > 0
  )`;
  // Projects and languages can be many, so the largest are kept and the rest drawn as one.
  const ranks = input.split === "project" || input.split === "language";
  const result = await db.execute<{
    start: string;
    /** Projects and languages: 1 to 5 for the largest, 0 for the rest; null for an empty bar. */
    slot: number | null;
    /** The project or language for slots 1 to 5, else the band or task step; null for the rest. */
    key: string | null;
    units: number;
  }>(sql`
    with ${grouped}${
      ranks
        ? sql`, ranked as (
            select key, (row_number() over (order by sum(units) desc, key))::integer as slot
            from grouped group by 1
          )`
        : sql``
    }
    select b.start::date::text as start,
      ${
        ranks
          ? sql`case when g.key is null then null else coalesce(r.slot, 0) end as slot, r.key`
          : sql`null::integer as slot, g.key`
      },
      coalesce(sum(g.units), 0)::float8 as units
    from ${bars.starts} b(start)
    left join grouped g on g.start = b.start::date
    ${ranks ? sql`left join ranked r on r.key = g.key and r.slot <= ${WORD_COUNT_CHART_GROUPS}` : sql``}
    group by 1, 2, 3
    order by 1, 2
  `);
  const rows = result.rows;
  // Each row's series: by rank for projects and languages ("Other" last), else by fixed order.
  let groups: WordCountSeries["groups"];
  let seriesOf: (row: (typeof rows)[number]) => number | null;
  if (ranks) {
    const slots = [...new Set(rows.flatMap((row) => (row.slot === null ? [] : [row.slot])))].sort(
      (left, right) => (left || Infinity) - (right || Infinity),
    );
    const keyOf = (slot: number) => rows.find((row) => row.slot === slot)!.key;
    const names =
      input.split === "project"
        ? (await groupNames(slots.map((slot) => ({ projectId: keyOf(slot), jobId: null }))))
            .projectNames
        : new Map<string, string>();
    groups = slots.map((slot) =>
      slot === 0
        ? { key: null, name: null, other: true }
        : { key: keyOf(slot), name: names.get(keyOf(slot) ?? "") ?? null, other: false },
    );
    const position = new Map(slots.map((slot, index) => [slot, index]));
    seriesOf = (row) => (row.slot === null ? null : position.get(row.slot)!);
  } else {
    const order: readonly string[] = input.split === "band" ? BAND_TIER_ORDER : WORD_TASK_STEPS;
    const seriesKey = (key: string) =>
      input.split === "band" ? BAND_TIER_OF[key as MatchBucket] : key;
    const present = order.filter((name) =>
      rows.some((row) => row.key !== null && seriesKey(row.key) === name),
    );
    groups = present.map((name) => ({ key: name, name: null, other: false }));
    seriesOf = (row) => (row.key === null ? null : present.indexOf(seriesKey(row.key)));
  }
  const points = new Map<string, { start: string; units: number[] }>();
  for (const row of rows) {
    let point = points.get(row.start);
    if (!point) {
      point = { start: row.start, units: groups.map(() => 0) };
      points.set(row.start, point);
    }
    const series = seriesOf(row);
    if (series !== null) point.units[series] += row.units;
  }
  return { split: input.split, per: input.per, groups, points: [...points.values()] };
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
