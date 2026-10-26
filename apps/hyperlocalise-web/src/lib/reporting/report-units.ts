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
 * The units Reports counts work in. Words suit most languages; characters suit languages written
 * without spaces, such as Chinese and Japanese.
 */
export const REPORT_UNITS = ["words", "strings", "characters", "characters_with_spaces"] as const;
export type ReportUnit = (typeof REPORT_UNITS)[number];

export const REPORT_STEPS = ["translation", "review"] as const;
export type ReportStep = (typeof REPORT_STEPS)[number];

/** Task statuses in which a task can still be worked on. */
export const OPEN_TASK_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "waiting_for_review",
]);

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
