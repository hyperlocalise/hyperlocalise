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

/**
 * Payloads hold counts, locale codes, error codes, and IDs only. Never store
 * source text, translations, or filenames here.
 */
export type JobEventPayloads = {
  job_started: { targetLocales: string[] };
  context_ready: { glossaryTermCount: number };
  strings_extracted: { stringCount: number; localeCount: number };
  translations_reused: { reusedCount: number; totalCount: number };
  locale_progress: { translatedCount: number; totalCount: number };
  locale_retrying: Record<string, never>;
  locale_completed: { fileId: string };
  locale_failed: Record<string, never>;
  job_succeeded: {
    completedLocales: string[];
    failedLocales: string[];
    followUpJobId: string | null;
  };
  job_failed: { code: string; failedLocales: string[]; followUpJobId: string | null };
  job_cancelled: Record<string, never>;
  job_retried: Record<string, never>;
  job_marked_failed: Record<string, never>;
};

export type JobEventType = keyof JobEventPayloads;

export const JOB_EVENT_TYPES = [
  "job_started",
  "context_ready",
  "strings_extracted",
  "translations_reused",
  "locale_progress",
  "locale_retrying",
  "locale_completed",
  "locale_failed",
  "job_succeeded",
  "job_failed",
  "job_cancelled",
  "job_retried",
  "job_marked_failed",
] as const satisfies readonly JobEventType[];

export type JobEventInput = {
  [T in JobEventType]: { type: T; locale?: string | null; payload: JobEventPayloads[T] };
}[JobEventType];

export type JobEventRecord = {
  [T in JobEventType]: {
    id: string;
    jobId: string;
    workflowRunId: string | null;
    actorUserId: string | null;
    type: T;
    locale: string | null;
    payload: JobEventPayloads[T];
    createdAt: string;
  };
}[JobEventType];

export function isJobEventType(value: string): value is JobEventType {
  return (JOB_EVENT_TYPES as readonly string[]).includes(value);
}
