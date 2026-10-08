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

import { extractInternalMarkupSpans } from "./content-editor-internal-markup";

type MarkdownDelimiter = {
  start: number;
  end: number;
  literal: string;
};

function markdownMarkupSpans(message: string) {
  return extractInternalMarkupSpans(message).filter((span) => span.family === "MD");
}

function startsMarkdownLinkLabel(segment: string, start: number) {
  if (start < 0 || start >= segment.length || segment[start] !== "[") {
    return false;
  }
  let backslashes = 0;
  for (let idx = start - 1; idx >= 0 && segment[idx] === "\\"; idx -= 1) {
    backslashes += 1;
  }
  if (backslashes % 2 !== 0) {
    return false;
  }

  let depth = 1;
  for (let idx = start + 1; idx < segment.length; idx += 1) {
    const ch = segment[idx];
    if (ch === "\\") {
      idx += 1;
      continue;
    }
    if (ch === "[") {
      depth += 1;
      continue;
    }
    if (ch !== "]") {
      continue;
    }
    depth -= 1;
    if (depth !== 0) {
      continue;
    }
    return idx + 1 < segment.length && (segment[idx + 1] === "(" || segment[idx + 1] === "[");
  }
  return false;
}

function findMarkdownLinkDestinationEnd(line: string, start: number) {
  let depth = 1;
  let quote = "";
  for (let idx = start; idx < line.length; idx += 1) {
    const ch = line[idx] ?? "";
    if (ch === "\\") {
      idx += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return idx + 1;
      }
    }
  }
  return line.length;
}

function intercomHeadingIdEnd(segment: string, idx: number) {
  if (idx + 3 >= segment.length || !segment.startsWith("{#", idx)) {
    return -1;
  }
  const start = segment[idx + 2] ?? "";
  if (!/[A-Za-z]/.test(start)) {
    return -1;
  }
  let end = idx + 3;
  while (end < segment.length && /[A-Za-z0-9_:-]/.test(segment[end] ?? "")) {
    end += 1;
  }
  return segment[end] === "}" ? end + 1 : -1;
}

/** Collects the same markdown delimiters the Go parser protects as HLMDPH tokens. */
export function collectStandardMarkdownDelimiters(segment: string): MarkdownDelimiter[] {
  const delimiters: MarkdownDelimiter[] = [];
  let idx = 0;
  while (idx < segment.length) {
    if (segment[idx] === "!" && startsMarkdownLinkLabel(segment, idx + 1)) {
      delimiters.push({ start: idx, end: idx + 2, literal: segment.slice(idx, idx + 2) });
      idx += 2;
      continue;
    }
    if (segment[idx] === "[" && startsMarkdownLinkLabel(segment, idx)) {
      delimiters.push({ start: idx, end: idx + 1, literal: "[" });
      idx += 1;
      continue;
    }
    if (segment.startsWith("](", idx)) {
      const end = findMarkdownLinkDestinationEnd(segment, idx + 2);
      delimiters.push({ start: idx, end, literal: segment.slice(idx, end) });
      idx = end;
      continue;
    }
    if (segment.startsWith("][", idx)) {
      const closeIdx = segment.indexOf("]", idx + 2);
      if (closeIdx < 0) {
        idx += 1;
        continue;
      }
      const end = closeIdx + 1;
      delimiters.push({ start: idx, end, literal: segment.slice(idx, end) });
      idx = end;
      continue;
    }
    const headingEnd = intercomHeadingIdEnd(segment, idx);
    if (headingEnd > idx) {
      delimiters.push({
        start: idx,
        end: headingEnd,
        literal: segment.slice(idx, headingEnd),
      });
      idx = headingEnd;
      continue;
    }
    idx += 1;
  }
  return delimiters;
}

export function recoverMarkdownMarkupTokens(source: string, target: string): string | null {
  const tokens = markdownMarkupSpans(source);
  if (tokens.length === 0) {
    return null;
  }
  const delimiters = collectStandardMarkdownDelimiters(target);
  if (delimiters.length !== tokens.length) {
    return null;
  }

  let recovered = target;
  for (let index = delimiters.length - 1; index >= 0; index -= 1) {
    const delimiter = delimiters[index]!;
    const token = tokens[index]!;
    recovered = `${recovered.slice(0, delimiter.start)}${token.literal}${recovered.slice(delimiter.end)}`;
  }
  return recovered;
}

/** Shows protected markdown as `[title](url)` when the companion side still has real delimiters. */
export function formatMarkdownMarkupForDisplay(message: string, companion?: string): string {
  const tokens = markdownMarkupSpans(message);
  if (tokens.length === 0) {
    return message;
  }
  const delimiters = collectStandardMarkdownDelimiters(companion ?? "");
  if (delimiters.length !== tokens.length) {
    return message;
  }

  let expanded = message;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]!;
    const delimiter = delimiters[index]!;
    expanded = `${expanded.slice(0, token.start)}${delimiter.literal}${expanded.slice(token.end)}`;
  }
  return expanded;
}
