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
import {
  dayEnd,
  dayStart,
  idList,
  jobTitle,
  scopedProjectIds,
  type ReportScope,
} from "./report-scope";
import {
  TASK_RUN_STAGES,
  TASK_STEPS,
  type ReportStep,
  type TaskRunStage,
  type TaskStep,
} from "./report-units";

/**
 * Time for the Reports page: time people logged on tasks, and how long automated work ran.
 * Logged time counts each entry on its work date; automated time on the day the work finished.
 */

/**
 * What a task is for: post-edit for a proofread-kind task a visual workflow made for editing
 * machine output, proofread for the other tasks that review (a person's proofread task, an AI
 * review), translate for translation tasks, other for the rest (research, sync, assets). `job`
 * is the alias of a `jobs` row, which may be missing (a deleted task): then translate.
 */
export function taskStepSql(job: string): SQL {
  const j = sql.raw(job);
  return sql`case
    when ${j}.kind = 'proofread' and ${j}.input_payload->'metadata'->>'workflowTaskStep' = 'edit'
      then 'post_edit'
    when ${j}.kind in ('proofread', 'review') then 'proofread'
    when ${j}.kind = 'translation' or ${j}.kind is null then 'translate'
    else 'other' end`;
}

export type LoggedTimeRow = {
  jobId: string;
  /** Null when the task was deleted. */
  jobTitle: string | null;
  projectId: string;
  /** What the task is for: translate, post-edit or proofread. */
  taskStep: TaskStep;
  /** The step the time is costed as: translation or review. */
  step: ReportStep;
  targetLocale: string;
  minutes: number;
  people: number;
};

export type LoggedTime = {
  rows: LoggedTimeRow[];
  rowCount: number;
  page: number;
  pageSize: number;
  totals: { minutes: number; people: number; tasks: number };
  previousMinutes: number;
};

export const LOGGED_TIME_PAGE_SIZE = 50;

/** Narrows logged time to one person: a viewer who may not see what others' work costs. */
type LoggedTimeScope = ReportScope & { contributorId?: string };

function loggedTimeWhere(
  input: LoggedTimeScope,
  projectIds: string[],
  from: string,
  to: string,
): SQL {
  return sql`e.organization_id = ${input.organizationId}
    and e.project_id in (${idList(projectIds)}) and not e.voided
    and e.work_date >= ${dayStart(from)} and e.work_date < ${dayEnd(to)}
    ${input.jobIds?.length ? sql`and e.job_id in (${idList(input.jobIds)})` : sql``}
    ${input.targetLocale ? sql`and e.target_locale = ${input.targetLocale}` : sql``}
    ${input.contributorId ? sql`and e.contributor_id = ${input.contributorId}` : sql``}`;
}

/** Time logged in a period by task, step and language, most time first, 50 rows a page. */
export async function queryLoggedTime(
  input: LoggedTimeScope & {
    period: ReportPeriod;
    page: number;
    /** Every row on one page, for a download. */
    all?: boolean;
  },
): Promise<LoggedTime> {
  const projectIds = scopedProjectIds(input);
  const empty: LoggedTime = {
    rows: [],
    rowCount: 0,
    page: input.page,
    pageSize: LOGGED_TIME_PAGE_SIZE,
    totals: { minutes: 0, people: 0, tasks: 0 },
    previousMinutes: 0,
  };
  if (projectIds.length === 0) return empty;
  const current = loggedTimeWhere(input, projectIds, input.period.from, input.period.to);
  const result = await db.execute<{
    rows: LoggedTimeRow[];
    rowCount: number;
    totals: LoggedTime["totals"];
    previousMinutes: number;
  }>(sql`
    with grouped as (
      select e.job_id, e.project_id, e.step, e.target_locale, sum(e.minutes) as minutes,
        count(distinct e.contributor_id) as people
      from reporting_time_entries e where ${current}
      group by 1, 2, 3, 4
    ), page as (
      select * from grouped order by minutes desc, job_id, step, target_locale
      ${input.all ? sql`` : sql`limit ${LOGGED_TIME_PAGE_SIZE} offset ${(input.page - 1) * LOGGED_TIME_PAGE_SIZE}`}
    )
    select
      (select coalesce(json_agg(json_build_object(
          'jobId', p.job_id, 'jobTitle', ${jobTitle("j")}, 'projectId', p.project_id,
          'taskStep', ${taskStepSql("j")}, 'step', p.step, 'targetLocale', p.target_locale,
          'minutes', p.minutes::float8, 'people', p.people
        ) order by p.minutes desc, p.job_id, p.step, p.target_locale), '[]')
        from page p left join jobs j on j.id = p.job_id) as rows,
      (select count(*) from grouped)::integer as "rowCount",
      (select json_build_object(
          'minutes', coalesce(sum(e.minutes), 0)::float8,
          'people', count(distinct e.contributor_id),
          'tasks', count(distinct e.job_id))
        from reporting_time_entries e where ${current}) as totals,
      (select coalesce(sum(e.minutes), 0)::float8 from reporting_time_entries e
        where ${loggedTimeWhere(input, projectIds, input.period.previousFrom, input.period.previousTo)})
        as "previousMinutes"
  `);
  const found = result.rows[0];
  return { ...empty, ...found, pageSize: input.all ? found.rowCount : LOGGED_TIME_PAGE_SIZE };
}

export type AutomatedTime = {
  /** Visual workflow steps, by step type. */
  workflowSteps: { nodeType: string; milliseconds: number; runs: number }[];
  /**
   * Runs of translation tasks, from start to finish, and the same time by stage (every stage,
   * in order, `other` included). With a language chosen, only runs that reached that language
   * count; `reusing_memory` and `translating` are that language's own, the other stages and
   * the total the whole run's, and `other` is 0.
   */
  taskRuns: {
    milliseconds: number;
    runs: number;
    stages: { stage: TaskRunStage; milliseconds: number }[];
  };
};

/**
 * How long automated work that finished in a period ran. Workflows outside any project are
 * counted only when `includeUnattributed` is set; test runs with mock data never are.
 */
export async function queryAutomatedTime(
  input: Omit<ReportScope, "jobIds"> & {
    period: ReportPeriod;
    includeUnattributed: boolean;
  },
): Promise<AutomatedTime> {
  const projectIds = scopedProjectIds(input);
  const start = dayStart(input.period.from);
  const end = dayEnd(input.period.to);
  const projectFilter = projectIds.length
    ? sql`w.project_id in (${idList(projectIds)})`
    : sql`false`;
  const workflowProjects =
    input.includeUnattributed && !input.projectId
      ? sql`(${projectFilter} or w.project_id is null)`
      : projectFilter;
  const [steps, runs] = await Promise.all([
    db.execute<AutomatedTime["workflowSteps"][number]>(sql`
      select n.node_type as "nodeType",
        (sum(extract(epoch from n.finished_at - n.started_at)) * 1000)::float8 as milliseconds,
        count(*)::integer as runs
      from visual_workflow_node_runs n
      join visual_workflow_runs r on r.id = n.run_id
      join visual_workflows w on w.id = r.visual_workflow_id
      where n.organization_id = ${input.organizationId}
        and n.finished_at >= ${start} and n.finished_at < ${end} and n.started_at is not null
        and r.mode = 'live' and ${workflowProjects}
      group by 1 order by 2 desc, 1
    `),
    projectIds.length ? queryTaskRuns(input, projectIds, start, end) : Promise.resolve(NO_RUNS),
  ]);
  return { workflowSteps: steps.rows, taskRuns: runs };
}

const NO_RUNS: AutomatedTime["taskRuns"] = {
  milliseconds: 0,
  runs: 0,
  stages: TASK_RUN_STAGES.map((stage) => ({ stage, milliseconds: 0 })),
};

/**
 * Translation task runs that ended in the period: the run from its first event to its last,
 * and the time between the stage boundaries the file translation workflow records
 * (`job_started`, `strings_extracted`, `translations_reused` and `locale_progress` per
 * language, `job_succeeded` or `job_failed`). Languages run side by side, so translating runs
 * from the last memory reuse to the last language's last progress; the languages' finished
 * events are written together after every file is stored, so they mark nothing per language.
 * Only runs with a `job_started` event count: a string job's failed run records the failure
 * alone.
 */
async function queryTaskRuns(
  input: Omit<ReportScope, "jobIds">,
  projectIds: string[],
  start: SQL,
  end: SQL,
): Promise<AutomatedTime["taskRuns"]> {
  const locale = input.targetLocale;
  const forLocale = locale ? sql`and e.locale = ${locale}` : sql``;
  const ms = (value: SQL) => sql`coalesce(sum(extract(epoch from ${value})) * 1000, 0)::float8`;
  const result = await db.execute<{
    milliseconds: number;
    runs: number;
    preparing: number;
    reusing_memory: number;
    translating: number;
    finishing: number;
    other: number;
  }>(sql`
    with runs as (
      select max(e.created_at) - min(e.created_at) as took,
        max(e.created_at) filter (where e.type in ('job_succeeded', 'job_failed')) as ended,
        min(e.created_at) filter (where e.type = 'job_started') as started,
        min(e.created_at) filter (where e.type = 'strings_extracted') as extracted,
        max(e.created_at) filter (where e.type = 'translations_reused' ${forLocale}) as reused,
        max(e.created_at) filter (where e.type = 'translations_reused') as all_reused,
        max(e.created_at) filter (where e.type = 'locale_progress' ${forLocale}) as translated,
        max(e.created_at) filter (where e.type = 'locale_progress') as all_translated
        ${locale ? sql`, bool_or(e.locale = ${locale}) as has_language` : sql``}
      from jobs j join job_events e on e.job_id = j.id
      where j.organization_id = ${input.organizationId}
        and j.project_id in (${idList(projectIds)}) and j.kind = 'translation'
        -- A run that ended in the period leaves the task completed then or later.
        and (j.completed_at is null or j.completed_at >= ${start})
        and e.workflow_run_id is not null and e.created_at < ${end}
      group by e.job_id, e.workflow_run_id
    ), staged as (
      select took,
        greatest(extracted - started, interval '0') as preparing,
        greatest(reused - extracted, interval '0') as reusing_memory,
        greatest(translated - coalesce(reused, all_reused, extracted), interval '0') as translating,
        greatest(ended - coalesce(all_translated, all_reused, extracted), interval '0') as finishing
      from runs
      where started is not null and ended >= ${start} and ended < ${end}
        ${locale ? sql`and has_language` : sql``}
    )
    select ${ms(sql`took`)} as milliseconds, count(*)::integer as runs,
      ${ms(sql`preparing`)} as preparing, ${ms(sql`reusing_memory`)} as reusing_memory,
      ${ms(sql`translating`)} as translating,
      ${ms(sql`finishing`)} as finishing,
      ${
        locale
          ? sql`0::float8`
          : ms(
              sql`greatest(took - preparing - reusing_memory - translating - finishing, interval '0')`,
            )
      } as other
    from staged
  `);
  const row = result.rows[0]!;
  return {
    milliseconds: row.milliseconds,
    runs: row.runs,
    stages: TASK_RUN_STAGES.map((stage) => ({ stage, milliseconds: row[stage] })),
  };
}

export type StepTime = { taskStep: TaskStep; minutes: number; people: number };

/** Time people logged in a period, by what the task was for, in the order of the steps. */
export async function queryLoggedTimeBySteps(
  input: ReportScope & { period: ReportPeriod },
): Promise<StepTime[]> {
  const projectIds = scopedProjectIds(input);
  if (projectIds.length === 0) return [];
  const result = await db.execute<StepTime>(sql`
    select ${taskStepSql("j")} as "taskStep", sum(e.minutes)::float8 as minutes,
      count(distinct e.contributor_id)::integer as people
    from reporting_time_entries e left join jobs j on j.id = e.job_id
    where ${loggedTimeWhere(input, projectIds, input.period.from, input.period.to)}
    group by 1
  `);
  return result.rows.sort(
    (left, right) => TASK_STEPS.indexOf(left.taskStep) - TASK_STEPS.indexOf(right.taskStep),
  );
}
