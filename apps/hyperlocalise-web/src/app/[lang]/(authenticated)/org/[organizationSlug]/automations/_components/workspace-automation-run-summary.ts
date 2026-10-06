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

// Run summaries are free-form JSON written by whichever tools ran, and their shape changes as
// tools are added. Everything here reads them by structure, never by a fixed list of fields.

/** Keys whose string value is written for a person to read. */
const PROSE_KEYS = ["summary", "digest", "message", "description", "title"] as const;

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isRunSummaryRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isIsoDateTime(value: string) {
  return ISO_DATE_TIME.test(value);
}

/** "createNativeTmsJob" and "create_native_tms_job" both read "Create native tms job". */
export function humanizeRunSummaryKey(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function findProse(value: unknown, depth: number): string | null {
  if (depth > 4) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProse(entry, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRunSummaryRecord(value)) {
    return null;
  }

  for (const key of PROSE_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const entry of Object.values(value)) {
    const found = findProse(entry, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

/** One line for the collapsed row: the error if there is one, else the first readable sentence. */
export function resolveRunHeadline(run: {
  error: Record<string, unknown> | null;
  outputSummary: Record<string, unknown>;
}): string | null {
  return findProse(run.error, 0) ?? findProse(run.outputSummary, 0);
}

export function runHasDetails(run: {
  error: Record<string, unknown> | null;
  outputSummary: Record<string, unknown>;
}) {
  return Object.keys(run.outputSummary).length > 0 || Object.keys(run.error ?? {}).length > 0;
}
