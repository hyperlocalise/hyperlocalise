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

const MAILCHIMP_MERGE_PATTERN = /\*\|[^|]+\|\*/g;
const MAILCHIMP_MERGE_PLACEHOLDER = /<!--HL_MC_VAR_(\d+)-->/g;

function nextCommentRange(value: string, from: number): { start: number; end: number } | null {
  const start = value.indexOf("<!--", from);
  if (start === -1) {
    return null;
  }
  const close = value.indexOf("-->", start + 4);
  return { start, end: close === -1 ? value.length : close + 3 };
}

export function protectMailchimpMergeTags(
  value: string,
  existingTokens: readonly string[] = [],
): { text: string; tokens: string[] } {
  const tokens = [...existingTokens];
  let out = "";
  let cursor = 0;

  while (cursor < value.length) {
    const comment = nextCommentRange(value, cursor);
    MAILCHIMP_MERGE_PATTERN.lastIndex = cursor;
    const merge = MAILCHIMP_MERGE_PATTERN.exec(value);

    if (comment && (!merge || comment.start <= (merge.index ?? Infinity))) {
      out += value.slice(cursor, comment.end);
      cursor = comment.end;
      continue;
    }

    if (!merge || merge.index === undefined) {
      out += value.slice(cursor);
      break;
    }

    out += value.slice(cursor, merge.index);
    const index = tokens.length;
    tokens.push(merge[0]);
    out += `<!--HL_MC_VAR_${index}-->`;
    cursor = merge.index + merge[0].length;
  }

  return { text: out, tokens };
}

export function restoreMailchimpMergeTags(text: string, tokens: string[]): string {
  return text.replace(MAILCHIMP_MERGE_PLACEHOLDER, (match, index) => {
    const token = tokens[Number(index)];
    return token !== undefined ? token : match;
  });
}
