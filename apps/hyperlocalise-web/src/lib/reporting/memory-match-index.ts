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

/**
 * Finds the closest of a fixed set of memory source texts to each query without a database
 * round trip per query. Entries are indexed by character bigrams; a query scores only the
 * entries sharing the most bigrams with it, so the cost per query does not grow with the set.
 */
export class MemoryMatchIndex {
  private readonly entries: string[] = [];
  private readonly lengths: number[] = [];
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
      for (const gram of bigrams(normalized)) {
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
    const queryLength = Array.from(query).length;
    const counts = new Map<number, number>();
    for (const gram of bigrams(query)) {
      for (const id of this.postings.get(gram) ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const candidates = [...counts.entries()]
      .filter(([id]) => {
        const length = this.lengths[id];
        return Math.min(length, queryLength) >= MIN_LENGTH_RATIO * Math.max(length, queryLength);
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, CANDIDATE_LIMIT);
    let best = 0;
    for (const [id] of candidates) {
      best = Math.max(best, sourceSimilarity(query, this.entries[id]));
      if (best === 100) break;
    }
    return best;
  }
}
