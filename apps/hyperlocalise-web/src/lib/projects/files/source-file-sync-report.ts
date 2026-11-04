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
 * What a repository sync's ingest changed beyond the file's own keys, kept on the source file
 * version so a run summary and, later, a sync panel can show it.
 */
export type SourceFileSyncReport = {
  /** Keys in the project that the imported file no longer has. They were hidden, not deleted. */
  missingKeys: string[];
  /** How many there were, when more than the stored list holds. */
  missingKeyCount?: number;
  /** The sync run that showed this report, so a later run doesn't show it again. */
  reportedRunId?: string;
};

/** Enough to act on; a dropped file with thousands of keys doesn't bloat every run row. */
export const SYNC_REPORT_KEY_LIMIT = 200;
