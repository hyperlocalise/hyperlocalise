/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export const FILE_TRANSLATION_MAX_TRANSLATIONS_PER_SESSION = 1000;
export const FILE_TRANSLATION_MAX_PAGES = 500;

/** Parse `deferred_by_limit=N` from `hl run` stdout. Missing marker means 0. */
export function parseDeferredByLimit(output: string): number {
  const match = /\bdeferred_by_limit=(\d+)\b/.exec(output);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10) || 0;
}
