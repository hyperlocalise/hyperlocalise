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
import { OPEN_TASK_STATUSES, type ReportStep } from "./report-units";
import { refreshSummaryDays } from "./summary";
import { touchTaskAnalysis } from "./task-analysis-status";

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

export type TaskLanguageAnalysisInput = Omit<TaskAnalysisInput, "targetLocales"> & {
  targetLocale: string;
  /**
   * Record the strings without match bands: for a language whose memory could not be read or
   * scored after every retry, so the task still has its strings and its quote, marked not exact.
   */
  withoutMemory?: boolean;
};

/**
 * Records the task's strings as arrived for one of its languages, and notes the progress on the
 * task's analysis state. Returns how many strings, and the summary days the records marked.
 * Throws when a write or the memory read fails, so the caller can retry; running again records
 * nothing twice.
 */
export async function analyseTaskLanguage(
  input: TaskLanguageAnalysisInput,
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
  const progress = { organizationId: input.organizationId, jobId: input.jobId, step: input.step };
  if (keys.length === 0) {
    await touchTaskAnalysis({ ...progress, strings: 0 });
    return { strings: 0, days: [] };
  }
  // The key's id is the segment id, as editor saves record it, so a save finishes the same row.
  const sourceEntries = Object.fromEntries(keys.map((key) => [key.id, key.sourceText]));
  const marks = await recordAnalysis(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      jobId: input.jobId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceEntries,
      step: input.step,
      // Work people do is paid work: it counts in "still to come" whether or not an assignee is set.
      billable: true,
    },
    { withoutMemory: input.withoutMemory },
  );
  await touchTaskAnalysis({ ...progress, strings: keys.length });
  return { strings: keys.length, days: [...new Set(marks.map((mark) => mark.day))] };
}

/** `analyseTaskLanguage` for every language of the task, one after another. */
export async function analyseTaskStrings(
  input: TaskAnalysisInput,
): Promise<{ strings: number; days: string[] }> {
  const days = new Set<string>();
  let strings = 0;
  for (const targetLocale of new Set(input.targetLocales)) {
    const result = await analyseTaskLanguage({ ...input, targetLocale });
    strings = Math.max(strings, result.strings);
    for (const day of result.days) days.add(day);
  }
  return { strings, days: [...days] };
}

/**
 * Works out the task's days in the summary straight away, rather than at the next scheduled run,
 * so its Report tab and the estimate show its strings moments after the task is created. Waits a
 * few seconds for a scheduled run that holds the project, skips days that run did meanwhile, and
 * leaves the project's current rows, and the days' marks, to the scheduled run (rewriting the
 * current rows costs seconds for a large project, which a burst of new tasks would each pay; the
 * whole-project estimate lags a new task by up to one run). Throws when the project stays held,
 * so the caller retries later.
 */
export async function refreshTaskDays(input: {
  organizationId: string;
  projectId: string;
  days: string[];
}) {
  const outcome = await refreshSummaryDays({
    ...input,
    waitForLock: true,
    onlyMarked: true,
    skipCurrentRows: true,
  });
  if (outcome === "busy") throw new Error("reporting_summary_busy");
}

export type PersonTaskLookup = {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  targetLocale: string;
  step: ReportStep;
};

/** A task for people with when it was created and, once it is no longer open, when it ended. */
export type PersonTaskSpan = { id: string; createdAt: Date; endedAt: Date | null };

/**
 * The tasks for people that cover a string's file, language and step, newest first: proofread
 * or post-edit tasks for an approval, translate tasks for a translation. Jobs an agent ran are
 * not tasks for people.
 */
export async function personTasksForString(input: PersonTaskLookup): Promise<PersonTaskSpan[]> {
  const kind = input.step === "review" ? "proofread" : "translation";
  const openStatuses = sql.join(
    [...OPEN_TASK_STATUSES].map((status) => sql`${status}`),
    sql`, `,
  );
  const result = await db.execute<{
    id: string;
    createdAt: Date | string;
    endedAt: Date | string | null;
  }>(sql`
    select j.id, j.created_at as "createdAt",
      case when j.status in (${openStatuses}) then null
        else coalesce(j.completed_at, j.updated_at) end as "endedAt"
    from jobs j
    join translation_job_details d on d.job_id = j.id
    join repository_source_file_versions v on v.id = d.source_file_version_id
    where j.organization_id = ${input.organizationId} and j.project_id = ${input.projectId}
      and j.kind = ${kind} and j.workflow_run_id is null
      and (j.assignee_type is null or j.assignee_type = 'user')
      and v.repository_source_file_id = ${input.repositorySourceFileId}
      and j.input_payload -> 'targetLocales' ? ${input.targetLocale}
    order by j.created_at desc, j.id desc
  `);
  return result.rows.map((row) => ({
    id: row.id,
    createdAt: new Date(row.createdAt),
    endedAt: row.endedAt === null ? null : new Date(row.endedAt),
  }));
}

/**
 * The task a save made at `savedAt` belongs to: the newest of `tasks` created by then and not
 * ended before it (saves reach Reports some minutes later, and a task may have ended meanwhile).
 * Both times are to the millisecond, so a task created in the same millisecond as a save covers
 * it. With no time the save is being made now, so it belongs to the newest open task.
 */
export function personTaskAt(tasks: PersonTaskSpan[], savedAt?: Date): string | undefined {
  const task = savedAt
    ? tasks.find(
        (candidate) =>
          candidate.createdAt <= savedAt &&
          (candidate.endedAt === null || candidate.endedAt >= savedAt),
      )
    : tasks.find((candidate) => candidate.endedAt === null);
  return task?.id;
}

/** The task a save belongs to, and the step it counts as on that task. */
export type PersonTaskSave = { jobId: string; step: ReportStep };

/**
 * The task for people a save in the content editor belongs to, and the step it counts as. A save
 * at a task's own step is that task's work. An edit (a translation-step save) made while a
 * proofread task covers the string, with no translate task for people open, is that task's
 * review work: reviewers edit inside proofread and post-edit tasks, and the task's work and cost
 * should show where the work was done rather than as translation work on the job that produced
 * the text. Undefined when no task for people covers the save. `tasks` reads the candidate tasks,
 * so a caller matching many saves can cache them.
 */
export async function personTaskForSave(
  input: PersonTaskLookup & {
    /** When the save was made; now when left out. */
    savedAt?: Date;
    /**
     * A person made the save. Only a person's edit inside a proofread task is its review work;
     * an agent's or an import's edit stays translation work on the job that produced the text.
     */
    byPerson: boolean;
  },
  tasks: (lookup: PersonTaskLookup) => Promise<PersonTaskSpan[]> = personTasksForString,
): Promise<PersonTaskSave | undefined> {
  const { savedAt, byPerson, ...lookup } = input;
  const own = personTaskAt(await tasks(lookup), savedAt);
  if (own) return { jobId: own, step: lookup.step };
  if (lookup.step !== "translation" || !byPerson) return undefined;
  const review = personTaskAt(await tasks({ ...lookup, step: "review" }), savedAt);
  return review ? { jobId: review, step: "review" } : undefined;
}

/**
 * The task a save in the content editor belongs to (`personTaskAt` over `personTasksForString`).
 * Undefined when there is none.
 */
export async function openPersonTaskForString(
  input: PersonTaskLookup & {
    /** When the save was made; now when left out. */
    savedAt?: Date;
  },
): Promise<string | undefined> {
  return personTaskAt(await personTasksForString(input), input.savedAt);
}
