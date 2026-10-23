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

import { captureAnalysis } from "./capture";
import type { ReportStep } from "./report-units";

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

/** Records the task's strings as arrived for each of its languages. Returns how many strings. */
export async function analyseTaskStrings(input: TaskAnalysisInput): Promise<number> {
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
  if (keys.length === 0) return 0;
  // The key's id is the segment id, as editor saves record it, so a save finishes the same row.
  const sourceEntries = Object.fromEntries(keys.map((key) => [key.id, key.sourceText]));
  for (const targetLocale of new Set(input.targetLocales)) {
    await captureAnalysis({
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
  }
  return keys.length;
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
