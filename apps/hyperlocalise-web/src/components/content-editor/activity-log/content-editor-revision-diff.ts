/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

export type RevisionDiffPart = { kind: "same" | "added" | "removed"; text: string };

/** Above this many token pairs the texts are shown as one removal and one addition. */
const MAX_DIFF_CELLS = 250_000;

const TOKEN_PATTERN = /\s+|[^\s]+/g;

function tokenize(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

function pushPart(parts: RevisionDiffPart[], kind: RevisionDiffPart["kind"], text: string) {
  const last = parts.at(-1);
  if (last?.kind === kind) {
    last.text += text;
  } else {
    parts.push({ kind, text });
  }
}

/** Word-level diff from `before` to `after`, keeping whitespace as its own tokens. */
export function diffRevisionText(before: string, after: string): RevisionDiffPart[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  const left = tokenize(before);
  const right = tokenize(after);
  if (left.length * right.length > MAX_DIFF_CELLS) {
    const parts: RevisionDiffPart[] = [];
    if (before) parts.push({ kind: "removed", text: before });
    if (after) parts.push({ kind: "added", text: after });
    return parts;
  }

  const columns = right.length + 1;
  const lengths = new Uint32Array((left.length + 1) * columns);
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lengths[i * columns + j] =
        left[i] === right[j]
          ? lengths[(i + 1) * columns + j + 1] + 1
          : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1]);
    }
  }

  const parts: RevisionDiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      pushPart(parts, "same", left[i]);
      i++;
      j++;
    } else if (lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1]) {
      pushPart(parts, "removed", left[i]);
      i++;
    } else {
      pushPart(parts, "added", right[j]);
      j++;
    }
  }
  for (; i < left.length; i++) pushPart(parts, "removed", left[i]);
  for (; j < right.length; j++) pushPart(parts, "added", right[j]);
  return parts;
}
