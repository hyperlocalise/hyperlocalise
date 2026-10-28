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
import type { MatchBucket } from "./word-analysis";

/**
 * The units Reports counts work in. Words suit most languages; characters suit languages written
 * without spaces, such as Chinese and Japanese.
 */
export const REPORT_UNITS = ["words", "strings", "characters", "characters_with_spaces"] as const;
export type ReportUnit = (typeof REPORT_UNITS)[number];

export const REPORT_STEPS = ["translation", "review"] as const;
export type ReportStep = (typeof REPORT_STEPS)[number];

/**
 * What a task is for, as people see it. Reports prices translate work as `translation` and
 * post-edit and proofread as `review`; time views tell post-edit and proofread apart by the
 * task. `other` is a task that is none of those (research, sync, assets) that someone logged
 * time on.
 */
export const TASK_STEPS = ["translate", "post_edit", "proofread", "other"] as const;
export type TaskStep = (typeof TASK_STEPS)[number];

/** A task step for word counts, which also count work saved in the content editor outside any task. */
export const WORD_TASK_STEPS = [...TASK_STEPS, "no_task"] as const;
export type WordTaskStep = (typeof WORD_TASK_STEPS)[number];

/**
 * The stages of a translation task's run, between the events the file translation workflow
 * records: preparing (the sandbox, the file's strings, the glossary, guidelines and memory, in
 * whichever order the file type needs) up to `strings_extracted`; reusing the memory up to the
 * last `translations_reused`; translating up to the last `locale_progress`; finishing (writing
 * and storing the translated files, the follow-up, the status) up to the end. `other` is a
 * run's time outside those: runs with no stage events, such as image and video runs or runs
 * from before the events existed.
 */
export const TASK_RUN_STAGES = [
  "preparing",
  "reusing_memory",
  "translating",
  "finishing",
  "other",
] as const;
export type TaskRunStage = (typeof TASK_RUN_STAGES)[number];

/** Task statuses in which a task can still be worked on. */
export const OPEN_TASK_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "waiting_for_review",
]);

/** How far a task for people's analysis (its strings recorded for Reports) has got. */
export const TASK_ANALYSIS_STATUSES = ["pending", "done", "failed"] as const;
export type TaskAnalysisStatus = (typeof TASK_ANALYSIS_STATUSES)[number];

/** What a rate line is charged per: a word, a character without or with spaces, or an hour. */
export const RATE_BASES = ["word", "character", "character_with_spaces", "hour"] as const;
export type RateBasis = (typeof RATE_BASES)[number];

/**
 * Where a finished string's text came from: the translation memory, an AI model, a person, or an
 * import. The summary keeps "unknown" for rows recorded before this was known.
 */
export const COMPLETION_SOURCES = ["memory", "ai", "person", "import"] as const;
export type CompletionSource = (typeof COMPLETION_SOURCES)[number];
export const SUMMARY_SOURCES = [...COMPLETION_SOURCES, "unknown"] as const;
export type SummarySource = (typeof SUMMARY_SOURCES)[number];

/** How Word counts groups its table. */
export const WORD_COUNT_GROUPINGS = ["project", "task", "week", "language", "task_step"] as const;
export type WordCountGrouping = (typeof WORD_COUNT_GROUPINGS)[number];

/** What the volume chart splits each bar by. */
export const WORD_COUNT_SPLITS = ["project", "language", "band", "task_step"] as const;
export type WordCountSplit = (typeof WORD_COUNT_SPLITS)[number];

/** How long each bar of the volume chart covers. */
export const WORD_COUNT_INTERVALS = ["day", "week", "month"] as const;
export type WordCountInterval = (typeof WORD_COUNT_INTERVALS)[number];

/**
 * The tiers the volume chart draws match bands in, strongest memory match first. One hue shows
 * about four steps apart, so there are four tiers of memory leverage, then new.
 */
export const BAND_TIER_ORDER = ["exact", "high", "fuzzy", "low", "new"] as const;
export type BandTier = (typeof BAND_TIER_ORDER)[number];

/** Each match band's tier; "unavailable" goes with new, since it is paid as new. */
export const BAND_TIER_OF: Record<MatchBucket, BandTier> = {
  repetition: "exact",
  "100": "exact",
  "95-99": "high",
  "85-94": "fuzzy",
  "75-84": "fuzzy",
  "50-74": "low",
  new: "new",
  unavailable: "new",
};
