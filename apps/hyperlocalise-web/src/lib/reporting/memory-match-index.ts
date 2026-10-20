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
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

/** How many of the entries sharing the most bigrams with a query are scored exactly. */
const CANDIDATE_LIMIT = 64;
/** A candidate must be at least this fraction of the query's length to reach a 50% score. */
const MIN_LENGTH_RATIO = 0.5;

/** Character edit similarity on normalized text; 100 only for identical strings. */
export function sourceSimilarity(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length === 0 && b.length === 0) return 100;
  if (a.length === 0 || b.length === 0) return 0;
  const longest = Math.max(a.length, b.length);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return Math.floor(100 * (1 - previous[b.length] / longest));
}

function bigrams(text: string): Set<string> {
  const chars = Array.from(text);
  const grams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) grams.add(chars[i] + chars[i + 1]);
  if (chars.length === 1) grams.add(chars[0]);
  return grams;
}

interface Candidate {
  text: string;
  length: number;
  /** Distinct bigrams in the entry. */
  grams: number;
  /** Distinct bigrams shared with the query. */
  shared: number;
}

/** Ranks candidates by bigram overlap relative to both texts' size (Dice), then by text. */
function rankAbove(
  left: { dice: number; text: string },
  right: { dice: number; text: string },
): boolean {
  return left.dice > right.dice || (left.dice === right.dice && left.text < right.text);
}

/**
 * Scores exactly the entries whose bigrams overlap the query's most, relative to the size of both
 * (Dice), so many longer entries containing a short query cannot crowd out a near-identical one.
 * Ties go to the lowest text, so the score does not depend on the order the entries were loaded in.
 */
function bestCandidateScore(
  query: string,
  queryLength: number,
  queryGrams: number,
  candidates: Candidate[],
): number {
  // The CANDIDATE_LIMIT best, kept as a heap whose root is the weakest of them.
  const heap: { dice: number; text: string }[] = [];
  const weaker = (i: number, j: number) => rankAbove(heap[j], heap[i]);
  const swap = (i: number, j: number) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
  for (const candidate of candidates) {
    const { length } = candidate;
    if (Math.min(length, queryLength) < MIN_LENGTH_RATIO * Math.max(length, queryLength)) continue;
    const entry = {
      dice: (2 * candidate.shared) / (queryGrams + candidate.grams),
      text: candidate.text,
    };
    if (heap.length === CANDIDATE_LIMIT) {
      if (!rankAbove(entry, heap[0])) continue;
      heap[0] = entry;
      for (let i = 0; ;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let weakest = i;
        if (left < heap.length && weaker(left, weakest)) weakest = left;
        if (right < heap.length && weaker(right, weakest)) weakest = right;
        if (weakest === i) break;
        swap(i, weakest);
        i = weakest;
      }
    } else {
      heap.push(entry);
      for (let i = heap.length - 1; i > 0;) {
        const parent = (i - 1) >> 1;
        if (!weaker(i, parent)) break;
        swap(i, parent);
        i = parent;
      }
    }
  }
  let best = 0;
  for (const candidate of heap) {
    best = Math.max(best, sourceSimilarity(query, candidate.text));
    if (best === 100) break;
  }
  return best;
}

/**
 * Finds the closest of a fixed set of memory source texts to each query without a database
 * round trip per query. Entries are indexed by character bigrams; a query scores only the
 * entries sharing the most bigrams with it, so the cost per query does not grow with the set.
 */
export class MemoryMatchIndex {
  private readonly entries: string[] = [];
  private readonly lengths: number[] = [];
  private readonly gramCounts: number[] = [];
  private readonly exact = new Set<string>();
  private readonly postings = new Map<string, number[]>();

  constructor(sourceTexts: Iterable<string>) {
    for (const text of sourceTexts) {
      const normalized = normalizeTranslationMemorySourceText(text);
      if (this.exact.has(normalized)) continue;
      const id = this.entries.length;
      this.entries.push(normalized);
      this.lengths.push(Array.from(normalized).length);
      this.exact.add(normalized);
      const grams = bigrams(normalized);
      this.gramCounts.push(grams.size);
      for (const gram of grams) {
        let posting = this.postings.get(gram);
        if (!posting) this.postings.set(gram, (posting = []));
        posting.push(id);
      }
    }
  }

  get size(): number {
    return this.entries.length;
  }

  /** The best similarity score for the query, 0 to 100. */
  bestScore(sourceText: string): number {
    const query = normalizeTranslationMemorySourceText(sourceText);
    if (this.exact.has(query)) return 100;
    const counts = new Map<number, number>();
    const queryGrams = bigrams(query);
    for (const gram of queryGrams) {
      for (const id of this.postings.get(gram) ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const candidates = Array.from(counts, ([id, shared]) => ({
      text: this.entries[id],
      length: this.lengths[id],
      grams: this.gramCounts[id],
      shared,
    }));
    return bestCandidateScore(query, Array.from(query).length, queryGrams.size, candidates);
  }
}

const CODE_POINT_COUNT = 0x110000;

/** Bigrams as numbers, so a scan can look them up without building strings. */
function bigramKeys(text: string): number[] {
  const points = Array.from(text, (char) => char.codePointAt(0)!);
  if (points.length === 1) return [-1 - points[0]];
  const keys = new Set<number>();
  for (let i = 0; i < points.length - 1; i++)
    keys.add(points[i] * CODE_POINT_COUNT + points[i + 1]);
  return [...keys];
}

/**
 * Gives the same scores as {@link MemoryMatchIndex} without building it: each query reads every
 * entry once. Cheaper when only a few strings are scored, since building the index costs several
 * such reads.
 */
export class MemorySourceScan {
  private readonly entries: string[] = [];
  private readonly lengths: number[] = [];
  private readonly gramCounts: number[] = [];
  private readonly exact = new Set<string>();

  constructor(sourceTexts: Iterable<string>) {
    for (const text of sourceTexts) {
      const normalized = normalizeTranslationMemorySourceText(text);
      if (this.exact.has(normalized)) continue;
      this.entries.push(normalized);
      this.lengths.push(Array.from(normalized).length);
      this.gramCounts.push(bigramKeys(normalized).length);
      this.exact.add(normalized);
    }
  }

  /** The best similarity score for the query, 0 to 100. */
  bestScore(sourceText: string): number {
    const query = normalizeTranslationMemorySourceText(sourceText);
    if (this.exact.has(query)) return 100;
    const queryLength = Array.from(query).length;
    const slots = new Map(bigramKeys(query).map((key, slot) => [key, slot]));
    const lastSeen = new Int32Array(slots.size).fill(-1);
    const candidates: Candidate[] = [];
    for (let id = 0; id < this.entries.length; id++) {
      const length = this.lengths[id];
      if (Math.min(length, queryLength) < MIN_LENGTH_RATIO * Math.max(length, queryLength))
        continue;
      const text = this.entries[id];
      let shared = 0;
      if (length === 1) {
        shared = slots.has(-1 - text.codePointAt(0)!) ? 1 : 0;
      } else {
        let previous = -1;
        for (let i = 0; i < text.length;) {
          const point = text.codePointAt(i)!;
          i += point > 0xffff ? 2 : 1;
          if (previous >= 0) {
            const slot = slots.get(previous * CODE_POINT_COUNT + point);
            if (slot !== undefined && lastSeen[slot] !== id) {
              lastSeen[slot] = id;
              shared++;
            }
          }
          previous = point;
        }
      }
      if (shared > 0) candidates.push({ text, length, grams: this.gramCounts[id], shared });
    }
    return bestCandidateScore(query, queryLength, slots.size, candidates);
  }
}
