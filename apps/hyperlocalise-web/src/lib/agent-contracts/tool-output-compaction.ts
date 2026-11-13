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
 * Tool results can be large (file contents, search hits, command output). The chat stream and
 * stored message parts carry a shortened copy; the full result is stored separately and loaded
 * when a reader expands the tool.
 */

/** Longest string kept whole inside a tool result. */
export const TOOL_OUTPUT_MAX_STRING_LENGTH = 2_000;
/** Longest array kept whole inside a tool result. */
export const TOOL_OUTPUT_MAX_ARRAY_ITEMS = 50;
/** Deepest nesting kept; deeper values are replaced with a marker. */
const TOOL_OUTPUT_MAX_DEPTH = 8;

/** Keys whose string values the chat needs whole, such as an image link. */
const PRESERVED_STRING_KEYS = new Set(["url", "contentType", "filename", "mediaType"]);

export type CompactToolOutputResult = {
  output: unknown;
  /** Characters and items left out of the shortened copy. Zero when nothing was cut. */
  omitted: number;
};

function compactValue(
  value: unknown,
  depth: number,
  key: string | null,
  counter: { omitted: number },
): unknown {
  if (typeof value === "string") {
    if (value.length <= TOOL_OUTPUT_MAX_STRING_LENGTH || (key && PRESERVED_STRING_KEYS.has(key))) {
      return value;
    }
    const left = value.length - TOOL_OUTPUT_MAX_STRING_LENGTH;
    counter.omitted += left;
    return `${value.slice(0, TOOL_OUTPUT_MAX_STRING_LENGTH)}… [${left} more characters]`;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (depth >= TOOL_OUTPUT_MAX_DEPTH) {
    counter.omitted += 1;
    return "[nested value omitted]";
  }

  if (Array.isArray(value)) {
    const kept = value
      .slice(0, TOOL_OUTPUT_MAX_ARRAY_ITEMS)
      .map((item) => compactValue(item, depth + 1, null, counter));
    if (value.length > TOOL_OUTPUT_MAX_ARRAY_ITEMS) {
      const left = value.length - TOOL_OUTPUT_MAX_ARRAY_ITEMS;
      counter.omitted += left;
      kept.push(`[${left} more items]`);
    }
    return kept;
  }

  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    result[entryKey] = compactValue(entryValue, depth + 1, entryKey, counter);
  }
  return result;
}

/** Returns a shortened copy of a tool result, keeping its shape so the chat can still render it. */
export function compactToolOutput(output: unknown): CompactToolOutputResult {
  const counter = { omitted: 0 };
  const compacted = compactValue(output, 0, null, counter);
  return counter.omitted > 0
    ? { output: compacted, omitted: counter.omitted }
    : { output, omitted: 0 };
}
