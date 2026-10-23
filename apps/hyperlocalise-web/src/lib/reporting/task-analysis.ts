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
import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import { recordAnalysis } from "./capture";
import type { ReportStep } from "./report-units";
import { refreshSummaryDays } from "./summary";

/**
 * A task for people (a proofread task, a visual workflow's translate, post-edit or proofread
 * task) runs no agent, so nothing records its strings as arrived until people save them. These
 * record them when the task is created, so its match analysis, estimate and "still to come" exist
 * before any work, and attribute the saves people then make in the editor to the task.
 */

export type TaskAnalysisInput = {
  organizationId: string;
  projectId: string;
  jobId: string;
  /** Review for a proofread task; translation for a translate or post-edit task. */
  step: ReportStep;
  sourceLocale: string;
  targetLocales: string[];
  /** The task's file: its strings are the file's visible keys in the content editor. */
  repositorySourceFileId: string;
};

/**
 * Records the task's strings as arrived for each of its languages. Returns how many strings, and
 * the summary days the records marked. Throws when a write or the memory read fails, so the
 * caller can retry; running again records nothing twice.
 */
export async function analyseTaskStrings(
  input: TaskAnalysisInput,
): Promise<{ strings: number; days: string[] }> {
  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      sourceText: schema.projectTranslationKeys.sourceText,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
        eq(schema.projectTranslationKeys.isHidden, false),
      ),
    );
  if (keys.length === 0) return { strings: 0, days: [] };
  // The key's id is the segment id, as editor saves record it, so a save finishes the same row.
  const sourceEntries = Object.fromEntries(keys.map((key) => [key.id, key.sourceText]));
  const days = new Set<string>();
  for (const targetLocale of new Set(input.targetLocales)) {
    const marks = await recordAnalysis({
      organizationId: input.organizationId,
      projectId: input.projectId,
      jobId: input.jobId,
      sourceLocale: input.sourceLocale,
      targetLocale,
      sourceEntries,
      step: input.step,
      // Work people do is paid work: it counts in "still to come" whether or not an assignee is set.
      billable: true,
    });
    for (const mark of marks) days.add(mark.day);
  }
  return { strings: keys.length, days: [...days] };
}

/**
 * Works out the task's days in the summary straight away, rather than at the next scheduled run,
 * so its Report tab and the estimate show its strings moments after the task is created. Throws
 * while a scheduled run holds the project, so the caller retries once that run has finished.
 */
export async function refreshTaskDays(input: {
  organizationId: string;
  projectId: string;
  days: string[];
}) {
  if ((await refreshSummaryDays(input)) === "busy") throw new Error("reporting_summary_busy");
}

/** How long after a task is created its Report tab says the task's strings are being counted. */
const COUNTING_WAIT_MS = 10 * 60_000;

/**
 * Whether a task's strings for a step are on their way to its Report tab, which has nothing for
 * the step yet: they are recorded but not yet in the summary, or the task is new enough that its
 * background count may not have run. The tab then says the strings are being counted, not that
 * there are none.
 */
export async function taskStillBeingCounted(input: {
  organizationId: string;
  job: { id: string; kind: string; createdAt: Date };
  step: ReportStep;
  now?: Date;
}): Promise<boolean> {
  const ownStep =
    input.job.kind === "proofread"
      ? "review"
      : input.job.kind === "translation"
        ? "translation"
        : null;
  const age = (input.now ?? new Date()).getTime() - input.job.createdAt.getTime();
  if (ownStep === input.step && age < COUNTING_WAIT_MS) return true;
  const [recorded] = await db
    .select({ id: schema.reportingAnalyses.id })
    .from(schema.reportingAnalyses)
    .where(
      and(
        eq(schema.reportingAnalyses.organizationId, input.organizationId),
        eq(schema.reportingAnalyses.jobId, input.job.id),
        eq(schema.reportingAnalyses.step, input.step),
        eq(schema.reportingAnalyses.isCurrent, true),
      ),
    )
    .limit(1);
  return Boolean(recorded);
}

/**
 * The task a save in the content editor belongs to: the newest task for people that covers the
 * string's file, language and step (a proofread or post-edit task for an approval, a translate
 * task for a translation) and was open when the save was made: still open, or ended since
 * `savedAt` (saves reach Reports some minutes later, and a task may be marked done meanwhile).
 * Jobs an agent ran are not tasks for people. Undefined when there is none.
 */
export async function openPersonTaskForString(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  targetLocale: string;
  step: ReportStep;
  /** When the save was made; now when left out. */
  savedAt?: Date;
}): Promise<string | undefined> {
  const kind = input.step === "review" ? "proofread" : "translation";
  const savedAt = input.savedAt ?? new Date();
  const result = await db.execute<{ id: string }>(sql`
    select j.id from jobs j
    join translation_job_details d on d.job_id = j.id
    join repository_source_file_versions v on v.id = d.source_file_version_id
    where j.organization_id = ${input.organizationId} and j.project_id = ${input.projectId}
      and j.kind = ${kind} and j.workflow_run_id is null
      and (j.assignee_type is null or j.assignee_type = 'user')
      and j.created_at <= ${savedAt}
      and (j.status = 'waiting_for_review' or j.updated_at >= ${savedAt})
      and v.repository_source_file_id = ${input.repositorySourceFileId}
      and j.input_payload -> 'targetLocales' ? ${input.targetLocale}
    order by j.created_at desc
    limit 1
  `);
  return result.rows[0]?.id;
}
