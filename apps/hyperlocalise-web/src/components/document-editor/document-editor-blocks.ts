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
import type { JSONContent } from "@tiptap/core";

export type DocumentBlockSignature = {
  kind: string;
  text: string;
};

export type DocumentHeading = {
  blockIndex: number;
  level: number;
  text: string;
};

/** Above this many cells, alignment falls back to matching blocks in order. */
const MAX_ALIGNMENT_CELLS = 4_000_000;
const MATCH_SCORE = 2;
const TOKEN_BONUS = 1;
const LETTER_PATTERN = /\p{L}/u;
const INVARIANT_TOKEN_PATTERN = /https?:\/\/\S+|`[^`]+`|\{[^}]+\}|\d+(?:[.,]\d+)*/g;

export function documentBlockKind(type: string | undefined, attrs?: Record<string, unknown>) {
  if (type === "heading") {
    return `heading-${typeof attrs?.level === "number" ? attrs.level : 1}`;
  }
  if (type === "mdxComponent" && typeof attrs?.name === "string") {
    return `mdx-${attrs.name}`;
  }
  return type ?? "unknown";
}

export function jsonContentText(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }
  if (!node.content) {
    return "";
  }
  const separator = node.type === "doc" || node.type === "bulletList" ? "\n" : "";
  return node.content.map(jsonContentText).join(separator);
}

export function documentBlocksFromJson(doc: JSONContent): DocumentBlockSignature[] {
  return (doc.content ?? []).map((node) => ({
    kind: documentBlockKind(node.type, node.attrs),
    text: jsonContentText(node),
  }));
}

export function documentHeadings(blocks: DocumentBlockSignature[]): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  blocks.forEach((block, blockIndex) => {
    const match = /^heading-(\d)$/.exec(block.kind);
    if (match && block.text.trim()) {
      headings.push({ blockIndex, level: Number(match[1]), text: block.text.trim() });
    }
  });
  return headings;
}

function invariantTokens(text: string) {
  return new Set(text.match(INVARIANT_TOKEN_PATTERN) ?? []);
}

function pairScore(
  source: DocumentBlockSignature,
  target: DocumentBlockSignature,
  sourceTokens: Set<string>,
  targetTokens: Set<string>,
) {
  if (source.kind !== target.kind) {
    return Number.NEGATIVE_INFINITY;
  }
  let score = MATCH_SCORE;
  for (const token of targetTokens) {
    if (sourceTokens.has(token)) {
      score += TOKEN_BONUS;
    }
  }
  if (source.text.trim() === target.text.trim() && source.text.trim()) {
    score += TOKEN_BONUS;
  }
  return score;
}

/**
 * Maps each target block to the source block it translates, or `null`.
 * Translations keep the source structure, so blocks are aligned by kind in
 * order, with shared numbers, URLs, code, and placeholders breaking ties.
 */
export function alignDocumentBlocks(
  source: DocumentBlockSignature[],
  target: DocumentBlockSignature[],
): (number | null)[] {
  const rows = target.length;
  const columns = source.length;
  if (rows === 0) {
    return [];
  }
  if (columns === 0) {
    return target.map(() => null);
  }
  if (rows * columns > MAX_ALIGNMENT_CELLS) {
    return target.map((block, index) => (source[index]?.kind === block.kind ? index : null));
  }

  const sourceTokens = source.map((block) => invariantTokens(block.text));
  const targetTokens = target.map((block) => invariantTokens(block.text));
  const width = columns + 1;
  const scores = new Float64Array((rows + 1) * width);
  const moves = new Uint8Array((rows + 1) * width);
  const DIAGONAL = 1;
  const UP = 2;
  const LEFT = 3;

  for (let row = 1; row <= rows; row += 1) {
    moves[row * width] = UP;
  }
  for (let column = 1; column <= columns; column += 1) {
    moves[column] = LEFT;
  }

  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const up = scores[(row - 1) * width + column];
      const left = scores[row * width + column - 1];
      const diagonal =
        scores[(row - 1) * width + column - 1] +
        pairScore(
          source[column - 1],
          target[row - 1],
          sourceTokens[column - 1],
          targetTokens[row - 1],
        );
      let best = up;
      let move = UP;
      if (left > best) {
        best = left;
        move = LEFT;
      }
      if (diagonal >= best) {
        best = diagonal;
        move = DIAGONAL;
      }
      scores[row * width + column] = best;
      moves[row * width + column] = move;
    }
  }

  const alignment: (number | null)[] = target.map(() => null);
  let row = rows;
  let column = columns;
  while (row > 0 && column > 0) {
    const move = moves[row * width + column];
    if (move === DIAGONAL) {
      alignment[row - 1] = column - 1;
      row -= 1;
      column -= 1;
    } else if (move === UP) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  return alignment;
}

/** A block still reads as its source when it is unchanged and has words to translate. */
export function isUntranslatedBlock(
  target: DocumentBlockSignature,
  source: DocumentBlockSignature | undefined,
) {
  if (!source) {
    return false;
  }
  const text = target.text.trim();
  return text.length > 0 && LETTER_PATTERN.test(text) && text === source.text.trim();
}
