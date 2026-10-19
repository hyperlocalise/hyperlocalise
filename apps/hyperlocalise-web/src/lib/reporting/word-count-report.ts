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
import { sql } from "drizzle-orm";

import { db } from "@/lib/database/client";

import { csvCell, MATCH_BUCKETS, type MatchBucket } from "./word-analysis";

/** Words and strings in one group, both as analysed (the workload) and as completed so far. */
export type WordCountTotals = {
  analysedWords: number;
  analysedSegments: number;
  completedWords: number;
  completedSegments: number;
};

export type MatchAnalysisRow = WordCountTotals & {
  targetLocale: string;
  step: string;
  bucket: MatchBucket;
};

/**
 * A job's words and strings by match band, language and step: the CAT-tool "analysis". Built from
 * the job's current analysis rows, so it exists as soon as the job has been analysed, before any
 * string is completed; the completed columns fill in as the work is done.
 */
export async function queryJobMatchAnalysis(input: {
  organizationId: string;
  jobId: string;
}): Promise<MatchAnalysisRow[]> {
  const result = await db.execute<MatchAnalysisRow>(sql`
    select a.target_locale as "targetLocale", a.step, a.bucket,
      coalesce(sum(a.words), 0)::integer as "analysedWords",
      count(*)::integer as "analysedSegments",
      coalesce(sum(a.words) filter (where done.analysis_id is not null), 0)::integer as "completedWords",
      count(done.analysis_id)::integer as "completedSegments"
    from reporting_analyses a
    left join lateral (
      select c.analysis_id from reporting_activity c
      where c.analysis_id = a.id and c.kind = 'completion' limit 1
    ) done on true
    where a.organization_id = ${input.organizationId} and a.job_id = ${input.jobId} and a.is_current
    group by a.target_locale, a.step, a.bucket
  `);
  return result.rows.sort(
    (left, right) =>
      left.targetLocale.localeCompare(right.targetLocale) ||
      left.step.localeCompare(right.step) ||
      MATCH_BUCKETS.indexOf(left.bucket) - MATCH_BUCKETS.indexOf(right.bucket),
  );
}

export type WordVolumeRow = WordCountTotals & {
  projectId: string | null;
  projectName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  targetLocale: string;
};

/**
 * Words per project and language, or per job and language, for volume tracking. "Analysed" counts
 * the strings analysed in the date range (the workload that arrived); "completed" counts the
 * strings completed in the range, whenever they were analysed.
 */
export async function queryWordVolume(input: {
  organizationId: string;
  projectIds: string[];
  from: string;
  to: string;
  groupBy: "project" | "job";
  projectId?: string;
  targetLocale?: string;
  step?: "translation" | "review";
}): Promise<WordVolumeRow[]> {
  if (input.projectIds.length === 0) return [];
  const start = sql`(${input.from}::date::timestamp at time zone 'UTC')`;
  const end = sql`((${input.to}::date + 1)::timestamp at time zone 'UTC')`;
  const scope = sql`a.project_id in (${sql.join(
    input.projectIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;
  const filters = sql`
    ${input.projectId ? sql`and a.project_id = ${input.projectId}` : sql``}
    ${input.targetLocale ? sql`and a.target_locale = ${input.targetLocale}` : sql``}
    and a.step = ${input.step ?? "translation"}`;
  const jobKey = input.groupBy === "job" ? sql`a.job_id` : sql`null::text`;
  const result = await db.execute<WordVolumeRow>(sql`
    with analysed as (
      select a.project_id, ${jobKey} as job_id, a.target_locale,
        sum(a.words) as words, count(*) as segments
      from reporting_analyses a
      where a.organization_id = ${input.organizationId} and ${scope} and a.is_current
        and a.created_at >= ${start} and a.created_at < ${end} ${filters}
      group by 1, 2, 3
    ), completed as (
      select a.project_id, ${jobKey} as job_id, a.target_locale,
        sum(a.words) as words, count(distinct a.id) as segments
      from reporting_activity c join reporting_analyses a on a.id = c.analysis_id
      where c.organization_id = ${input.organizationId} and c.kind = 'completion' and ${scope}
        and c.created_at >= ${start} and c.created_at < ${end} ${filters}
      group by 1, 2, 3
    )
    select coalesce(an.project_id, co.project_id) as "projectId", p.name as "projectName",
      coalesce(an.job_id, co.job_id) as "jobId",
      coalesce(j.input_payload -> 'metadata' ->> 'title', j.id) as "jobTitle",
      coalesce(an.target_locale, co.target_locale) as "targetLocale",
      coalesce(an.words, 0)::integer as "analysedWords",
      coalesce(an.segments, 0)::integer as "analysedSegments",
      coalesce(co.words, 0)::integer as "completedWords",
      coalesce(co.segments, 0)::integer as "completedSegments"
    from analysed an
    full join completed co on co.project_id is not distinct from an.project_id
      and co.job_id is not distinct from an.job_id and co.target_locale = an.target_locale
    left join projects p on p.id = coalesce(an.project_id, co.project_id)
    left join jobs j on j.id = coalesce(an.job_id, co.job_id)
    order by p.name nulls last, "jobTitle" nulls last, "targetLocale"
  `);
  return result.rows;
}

export type ReportJobOption = { id: string; title: string; projectId: string | null };

/** Jobs that have Reports data, newest first, for the job picker. */
export async function listReportJobs(input: {
  organizationId: string;
  projectIds: string[];
  projectId?: string;
}): Promise<ReportJobOption[]> {
  if (input.projectIds.length === 0) return [];
  const result = await db.execute<ReportJobOption>(sql`
    select j.id, coalesce(j.input_payload -> 'metadata' ->> 'title', j.id) as title,
      j.project_id as "projectId"
    from jobs j
    where j.organization_id = ${input.organizationId}
      and j.project_id in (${sql.join(
        input.projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      ${input.projectId ? sql`and j.project_id = ${input.projectId}` : sql``}
      and exists (select 1 from reporting_analyses a where a.job_id = j.id)
    order by j.created_at desc
    limit 200
  `);
  return result.rows;
}

export function matchAnalysisCsv(rows: MatchAnalysisRow[]): string {
  const columns = [
    "targetLocale",
    "step",
    "bucket",
    "analysedWords",
    "analysedSegments",
    "completedWords",
    "completedSegments",
  ] as const;
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n");
}

export function wordVolumeCsv(rows: WordVolumeRow[], groupBy: "project" | "job"): string {
  const columns = [
    "projectName",
    ...(groupBy === "job" ? (["jobTitle", "jobId"] as const) : []),
    "targetLocale",
    "analysedWords",
    "analysedSegments",
    "completedWords",
    "completedSegments",
  ] as const;
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n");
}
