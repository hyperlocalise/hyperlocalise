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
import type { JobEventRecord } from "@/lib/job-events/job-events-contract";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

export type JobActivityLocaleStatus =
  | "pending"
  | "translating"
  | "retrying"
  | "completed"
  | "failed";

export type JobActivityLocale = {
  locale: string;
  status: JobActivityLocaleStatus;
  translatedCount: number | null;
  totalCount: number | null;
  reusedCount: number | null;
};

export type JobActivityRunStage = "preparing" | "translating" | "succeeded" | "failed" | "stopped";

export type JobActivityRun = {
  kind: "run";
  id: string;
  startedAt: string;
  endedAt: string | null;
  stage: JobActivityRunStage;
  stringCount: number | null;
  glossaryTermCount: number | null;
  failureCode: string | null;
  followUpJobId: string | null;
  locales: JobActivityLocale[];
  steps: JobEventRecord[];
};

export type JobActivityAction = {
  kind: "action";
  id: string;
  type: "job_cancelled" | "job_retried" | "job_marked_failed";
  actorUserId: string | null;
  createdAt: string;
};

export type JobActivityItem = JobActivityRun | JobActivityAction;

const UNKNOWN_RUN_ID = "unknown-run";

function ensureLocale(run: JobActivityRun, locale: string): JobActivityLocale {
  let entry = run.locales.find((item) => item.locale === locale);
  if (!entry) {
    entry = {
      locale,
      status: "pending",
      translatedCount: null,
      totalCount: null,
      reusedCount: null,
    };
    run.locales.push(entry);
  }
  return entry;
}

function isLocaleSettled(locale: JobActivityLocale) {
  return locale.status === "completed" || locale.status === "failed";
}

function applyRunEvent(run: JobActivityRun, event: JobEventRecord) {
  switch (event.type) {
    case "job_started":
      for (const locale of event.payload.targetLocales) ensureLocale(run, locale);
      break;
    case "context_ready":
      run.glossaryTermCount = event.payload.glossaryTermCount;
      break;
    case "strings_extracted":
      run.stringCount = event.payload.stringCount;
      break;
    case "translations_reused": {
      if (!event.locale) break;
      const locale = ensureLocale(run, event.locale);
      locale.reusedCount = event.payload.reusedCount;
      locale.translatedCount = event.payload.reusedCount;
      locale.totalCount = event.payload.totalCount;
      break;
    }
    case "locale_progress": {
      run.stage = "translating";
      if (!event.locale) break;
      const locale = ensureLocale(run, event.locale);
      if (!isLocaleSettled(locale)) locale.status = "translating";
      locale.translatedCount = event.payload.translatedCount;
      locale.totalCount = event.payload.totalCount;
      break;
    }
    case "locale_retrying": {
      run.stage = "translating";
      if (!event.locale) break;
      const locale = ensureLocale(run, event.locale);
      if (!isLocaleSettled(locale)) locale.status = "retrying";
      break;
    }
    case "locale_completed": {
      if (!event.locale) break;
      const locale = ensureLocale(run, event.locale);
      locale.status = "completed";
      if (locale.totalCount != null) locale.translatedCount = locale.totalCount;
      break;
    }
    case "locale_failed": {
      if (!event.locale) break;
      ensureLocale(run, event.locale).status = "failed";
      break;
    }
    case "job_succeeded":
      run.stage = "succeeded";
      run.endedAt = event.createdAt;
      run.followUpJobId = event.payload.followUpJobId;
      for (const locale of event.payload.completedLocales) {
        const entry = ensureLocale(run, locale);
        entry.status = "completed";
        if (entry.totalCount != null) entry.translatedCount = entry.totalCount;
      }
      for (const locale of event.payload.failedLocales) {
        ensureLocale(run, locale).status = "failed";
      }
      break;
    case "job_failed":
      run.stage = "failed";
      run.endedAt = event.createdAt;
      run.failureCode = event.payload.code;
      run.followUpJobId = event.payload.followUpJobId;
      for (const locale of run.locales) {
        if (locale.status !== "completed") locale.status = "failed";
      }
      break;
    case "job_cancelled":
    case "job_retried":
    case "job_marked_failed":
      break;
    default:
      assertNever(event);
  }
}

export function isJobStatusActive(status: string) {
  return status === "queued" || status === "running";
}

function settledStageForJobStatus(status: string): JobActivityRunStage {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  return "stopped";
}

/**
 * Groups a job's events into run cards (one per workflow attempt) and user
 * actions, in the order they happened. A run without a terminal event is
 * `stopped` once a later item exists; the latest one follows the job status,
 * since terminal events are best-effort.
 */
export function buildJobActivity(
  events: readonly JobEventRecord[],
  options: { jobStatus: string },
): JobActivityItem[] {
  const items: JobActivityItem[] = [];
  const runsById = new Map<string, JobActivityRun>();

  for (const event of events) {
    if (
      event.type === "job_cancelled" ||
      event.type === "job_retried" ||
      event.type === "job_marked_failed"
    ) {
      items.push({
        kind: "action",
        id: event.id,
        type: event.type,
        actorUserId: event.actorUserId,
        createdAt: event.createdAt,
      });
      continue;
    }

    const runId = event.workflowRunId ?? UNKNOWN_RUN_ID;
    let run = runsById.get(runId);
    if (!run) {
      run = {
        kind: "run",
        id: runId,
        startedAt: event.createdAt,
        endedAt: null,
        stage: "preparing",
        stringCount: null,
        glossaryTermCount: null,
        failureCode: null,
        followUpJobId: null,
        locales: [],
        steps: [],
      };
      runsById.set(runId, run);
      items.push(run);
    }
    run.steps.push(event);
    applyRunEvent(run, event);
  }

  items.forEach((item, index) => {
    if (item.kind !== "run" || item.endedAt) return;
    if (index !== items.length - 1) {
      item.stage = "stopped";
    } else if (!isJobStatusActive(options.jobStatus)) {
      item.stage = settledStageForJobStatus(options.jobStatus);
    }
  });

  return items;
}
