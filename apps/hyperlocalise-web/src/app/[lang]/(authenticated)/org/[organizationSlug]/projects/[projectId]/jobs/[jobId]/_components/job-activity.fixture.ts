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
import type { JobEventInput, JobEventRecord } from "@/lib/job-events/job-events-contract";

export const JOB_ACTIVITY_FIXTURE_START = Date.parse("2026-10-14T01:00:00.000Z");

export function jobEventsFixture(
  inputs: Array<JobEventInput & { workflowRunId?: string | null; actorUserId?: string | null }>,
  { stepSeconds = 20 }: { stepSeconds?: number } = {},
): JobEventRecord[] {
  return inputs.map(
    ({ workflowRunId = "run-1", actorUserId = null, locale = null, ...event }, index) =>
      ({
        ...event,
        id: `event-${index + 1}`,
        jobId: "job_1",
        workflowRunId,
        actorUserId,
        locale,
        createdAt: new Date(JOB_ACTIVITY_FIXTURE_START + index * stepSeconds * 1000).toISOString(),
      }) as JobEventRecord,
  );
}

const preparation: JobEventInput[] = [
  { type: "job_started", payload: { targetLocales: ["fr-FR", "de-DE", "ja-JP"] } },
  { type: "context_ready", payload: { glossaryTermCount: 12 } },
  { type: "strings_extracted", payload: { stringCount: 340, localeCount: 3 } },
  {
    type: "translations_reused",
    locale: "fr-FR",
    payload: { reusedCount: 80, totalCount: 340 },
  },
];

export const inProgressJobEvents = jobEventsFixture([
  ...preparation,
  { type: "locale_progress", locale: "fr-FR", payload: { translatedCount: 220, totalCount: 340 } },
  { type: "locale_progress", locale: "de-DE", payload: { translatedCount: 120, totalCount: 340 } },
  { type: "locale_progress", locale: "ja-JP", payload: { translatedCount: 40, totalCount: 340 } },
]);

export const partialFailureJobEvents = jobEventsFixture([
  ...preparation,
  { type: "locale_progress", locale: "fr-FR", payload: { translatedCount: 340, totalCount: 340 } },
  { type: "locale_progress", locale: "de-DE", payload: { translatedCount: 300, totalCount: 340 } },
  { type: "locale_retrying", locale: "ja-JP", payload: {} },
  { type: "locale_completed", locale: "fr-FR", payload: { fileId: "file-fr" } },
  { type: "locale_completed", locale: "de-DE", payload: { fileId: "file-de" } },
  { type: "locale_failed", locale: "ja-JP", payload: {} },
  {
    type: "job_succeeded",
    payload: {
      completedLocales: ["fr-FR", "de-DE"],
      failedLocales: ["ja-JP"],
      followUpJobId: "job_follow_up",
    },
  },
]);

export const failedThenRetriedJobEvents = jobEventsFixture([
  { type: "job_started", payload: { targetLocales: ["fr-FR"] } },
  { type: "context_ready", payload: { glossaryTermCount: 0 } },
  {
    type: "job_failed",
    payload: { code: "file_translation_failed", failedLocales: ["fr-FR"], followUpJobId: null },
  },
  { type: "job_retried", workflowRunId: null, actorUserId: "user-1", payload: {} },
  { type: "job_started", workflowRunId: "run-2", payload: { targetLocales: ["fr-FR"] } },
  {
    type: "strings_extracted",
    workflowRunId: "run-2",
    payload: { stringCount: 42, localeCount: 1 },
  },
]);
