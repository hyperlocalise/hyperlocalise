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

const LIST_SEPARATOR = /[\s,;]+/;

/**
 * Reads a list setting typed as "fr-FR, de-DE", or wired from an earlier step's array, which a
 * template renders as JSON.
 */
export function parseWorkflowList(value: unknown): string[] {
  let entries: unknown[];
  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === "number") {
    entries = [value];
  } else if (typeof value !== "string") {
    entries = [];
  } else if (value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      entries = value.replace(/[[\]"]/g, " ").split(LIST_SEPARATOR);
    }
  } else {
    entries = value.split(LIST_SEPARATOR);
  }
  return [
    ...new Set(
      entries.flatMap((entry) =>
        typeof entry === "string" || typeof entry === "number" ? [String(entry).trim()] : [],
      ),
    ),
  ].filter(Boolean);
}
