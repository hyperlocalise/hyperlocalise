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

const EMPTY_STATE_SOURCE_MAX_LENGTH = 80;

/** Short, single-line source excerpt for empty states that must name the string. */
export function emptyStateSourceLabel(sourceText: string | null | undefined) {
  const normalized = sourceText?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.length <= EMPTY_STATE_SOURCE_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, EMPTY_STATE_SOURCE_MAX_LENGTH - 1).trimEnd()}…`;
}
