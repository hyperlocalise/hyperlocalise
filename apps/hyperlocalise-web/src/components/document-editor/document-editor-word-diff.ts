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
export type WordDiffPart = { kind: "same" | "added" | "removed"; text: string };

/** Beyond this many token pairs the diff shows a full replacement. */
const MAX_DIFF_CELLS = 250_000;
const TOKEN_PATTERN = /\s+|[^\s]+/g;

function tokenize(text: string) {
  return text.match(TOKEN_PATTERN) ?? [];
}

function pushPart(parts: WordDiffPart[], kind: WordDiffPart["kind"], text: string) {
  const last = parts.at(-1);
  if (last?.kind === kind) {
    last.text += text;
    return;
  }
  parts.push({ kind, text });
}

export function diffWords(before: string, after: string): WordDiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > MAX_DIFF_CELLS) {
    const parts: WordDiffPart[] = [];
    if (before) parts.push({ kind: "removed", text: before });
    if (after) parts.push({ kind: "added", text: after });
    return parts;
  }

  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const parts: WordDiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushPart(parts, "same", a[i]);
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      pushPart(parts, "removed", a[i]);
      i += 1;
    } else {
      pushPart(parts, "added", b[j]);
      j += 1;
    }
  }
  for (; i < a.length; i += 1) pushPart(parts, "removed", a[i]);
  for (; j < b.length; j += 1) pushPart(parts, "added", b[j]);
  return parts;
}
