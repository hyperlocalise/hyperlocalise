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
/** The lowest score Reports puts in a match band rather than "new". */
const LOWEST_BAND_SCORE = 50;
/**
 * Queries up to this many characters can reach the lowest band without sharing a bigram with the
 * entry ("Yes" and "Yas"), so below that band they are also compared by shared characters.
 */
const SHORT_QUERY_LENGTH = 8;

/** Character edit similarity on normalized text; 100 only for identical strings. */
export function sourceSimilarity(left: string, right: string): number {
  return similarityAbove(codePoints(left), codePoints(right), -1);
}

/** The score `sourceSimilarity` gives an edit distance between texts of these lengths. */
function similarityOf(distance: number, longest: number): number {
  return Math.floor(100 * (1 - distance / longest));
}

function codePoints(text: string): Int32Array {
  const points = new Int32Array(text.length);
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const point = text.codePointAt(i)!;
    if (point > 0xffff) i++;
    points[count++] = point;
  }
  return points.subarray(0, count);
}

/** One row of the edit distance table, reused across calls. */
let distanceRow = new Int32Array(64);

/**
 * `sourceSimilarity` of two texts' code points when it is above `floor`; otherwise a score no
 * higher than `floor`, worked out only as far as needed to know that.
 */
function similarityAbove(a: Int32Array, b: Int32Array, floor: number): number {
  if (a.length === 0 && b.length === 0) return 100;
  if (a.length === 0 || b.length === 0) return 0;
  const longest = Math.max(a.length, b.length);
  // The largest edit distance that still scores above the floor.
  let limit = Math.max(0, Math.min(longest, Math.floor((longest * (99 - floor)) / 100)));
  while (limit < longest && similarityOf(limit + 1, longest) > floor) limit++;
  while (limit >= 0 && similarityOf(limit, longest) <= floor) limit--;
  if (limit < 0 || Math.abs(a.length - b.length) > limit) return Math.min(floor, 0);
  // A shared start and end do not change the edit distance.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--;
    bEnd--;
  }
  const rows = aEnd - start;
  const columns = bEnd - start;
  if (distanceRow.length <= columns) distanceRow = new Int32Array(2 * columns + 2);
  const row = distanceRow;
  for (let j = 0; j <= columns; j++) row[j] = j;
  for (let i = 1; i <= rows; i++) {
    let diagonal = row[0];
    row[0] = i;
    let rowLowest = i;
    const point = a[start + i - 1];
    for (let j = 1; j <= columns; j++) {
      const above = row[j];
      const value = Math.min(
        row[j - 1] + 1,
        above + 1,
        diagonal + (point === b[start + j - 1] ? 0 : 1),
      );
      diagonal = above;
      row[j] = value;
      if (value < rowLowest) rowLowest = value;
    }
    // Every alignment passes through this row, so the distance is at least its lowest value.
    if (rowLowest > limit) return Math.min(floor, 0);
  }
  return row[columns] <= limit ? similarityOf(row[columns], longest) : Math.min(floor, 0);
}

/**
 * The match score Reports records. 100 means the memory holds exactly this source text, the
 * rule translation reuse applies before filling in a stored translation (`file-memory.ts`).
 * Anything else, including text that differs only in case or spacing, scores at most 99.
 */
export function memoryMatchScore(sourceText: string, entrySourceText: string): number {
  if (sourceText === entrySourceText) return 100;
  return Math.min(
    99,
    sourceSimilarity(
      normalizeTranslationMemorySourceText(sourceText),
      normalizeTranslationMemorySourceText(entrySourceText),
    ),
  );
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
  const heap: { dice: number; text: string; length: number }[] = [];
  const weaker = (i: number, j: number) => rankAbove(heap[j], heap[i]);
  const swap = (i: number, j: number) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
  for (const candidate of candidates) {
    const { length } = candidate;
    if (Math.min(length, queryLength) < MIN_LENGTH_RATIO * Math.max(length, queryLength)) continue;
    const entry = {
      dice: (2 * candidate.shared) / (queryGrams + candidate.grams),
      text: candidate.text,
      length,
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
  // The edit distance is at least the difference in length, which caps each candidate's score.
  // Comparing the highest caps first lets a close match rule out the rest early.
  const queryPoints = codePoints(query);
  const ranked = heap
    .map((entry) => ({
      text: entry.text,
      cap: similarityOf(
        Math.abs(entry.length - queryLength),
        Math.max(entry.length, queryLength, 1),
      ),
    }))
    .sort((left, right) => right.cap - left.cap);
  let best = 0;
  for (const candidate of ranked) {
    if (candidate.cap <= best) break;
    best = Math.max(best, similarityAbove(queryPoints, codePoints(candidate.text), best));
    if (best === 100) break;
  }
  return best;
}

function withinLengthRatio(length: number, queryLength: number): boolean {
  return Math.min(length, queryLength) >= MIN_LENGTH_RATIO * Math.max(length, queryLength);
}

/**
 * Raises a short query's score from below the lowest band by ranking entries of a comparable
 * length on shared characters instead of bigrams. `entryIds` must cover every entry whose length
 * is within the length ratio of the query.
 */
function shortQueryScore(
  query: string,
  queryLength: number,
  bigramScore: number,
  entryIds: Iterable<number>,
  entries: string[],
  lengths: number[],
  distinctCharsOf: (id: number) => string,
): number {
  if (bigramScore >= LOWEST_BAND_SCORE || queryLength > SHORT_QUERY_LENGTH) return bigramScore;
  const queryChars = new Set(Array.from(query));
  const candidates: Candidate[] = [];
  for (const id of entryIds) {
    const length = lengths[id];
    if (!withinLengthRatio(length, queryLength)) continue;
    let chars = 0;
    let shared = 0;
    for (const char of distinctCharsOf(id)) {
      chars++;
      if (queryChars.has(char)) shared++;
    }
    if (shared > 0) candidates.push({ text: entries[id], length, grams: chars, shared });
  }
  return Math.max(bigramScore, bestCandidateScore(query, queryLength, queryChars.size, candidates));
}

/** The text's characters, each once, in the order they first appear. */
function distinctChars(text: string): string {
  return Array.from(new Set(Array.from(text))).join("");
}

/** The first position in `ids`, sorted ascending, holding an id of at least `id`. */
function lowerBound(ids: Int32Array, id: number): number {
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (ids[middle] < id) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Finds the closest of a fixed set of memory source texts to each query without a database
 * round trip per query. Entries are indexed by character bigrams and numbered in length order,
 * so a query counts shared bigrams only for the entries of a length that can reach the lowest
 * band, then scores exactly the entries sharing the most. The cost per query still grows with
 * the set, as most entries share a common bigram with most queries.
 */
export class MemoryMatchIndex {
  private readonly entries: string[] = [];
  private readonly lengths: number[] = [];
  private readonly gramCounts: number[] = [];
  /** Raw source texts: only an exact copy is a 100% match. */
  private readonly exact = new Set<string>();
  /** The ids of the entries with each bigram, ascending, so also by length. */
  private readonly postings = new Map<string, Int32Array>();
  /** `firstOfLength[n]` is the first id of an entry at least `n` characters long. */
  private readonly firstOfLength: Int32Array;
  /** By id, the distinct characters of the entries short enough to compare with a short query. */
  private readonly shortChars: string[] = [];
  /** Shared bigrams by entry id while a query is counted; all 0 between queries. */
  private readonly sharedCounts: Int32Array;
  /** The ids counted for the current query. */
  private readonly counted: Int32Array;

  constructor(sourceTexts: Iterable<string>) {
    const lengthOf = new Map<string, number>();
    for (const text of sourceTexts) {
      this.exact.add(text);
      const normalized = normalizeTranslationMemorySourceText(text);
      if (!lengthOf.has(normalized)) lengthOf.set(normalized, Array.from(normalized).length);
    }
    const postings = new Map<string, number[]>();
    for (const [normalized, length] of [...lengthOf].sort((a, b) => a[1] - b[1])) {
      const id = this.entries.length;
      this.entries.push(normalized);
      this.lengths.push(length);
      if (length * MIN_LENGTH_RATIO <= SHORT_QUERY_LENGTH) {
        this.shortChars.push(distinctChars(normalized));
      }
      const grams = bigrams(normalized);
      this.gramCounts.push(grams.size);
      for (const gram of grams) {
        let posting = postings.get(gram);
        if (!posting) postings.set(gram, (posting = []));
        posting.push(id);
      }
    }
    for (const [gram, ids] of postings) this.postings.set(gram, Int32Array.from(ids));
    const longest = this.lengths.at(-1) ?? 0;
    this.firstOfLength = new Int32Array(longest + 2);
    for (let length = 0, id = 0; length <= longest + 1; length++) {
      while (id < this.lengths.length && this.lengths[id] < length) id++;
      this.firstOfLength[length] = id;
    }
    this.sharedCounts = new Int32Array(this.entries.length);
    this.counted = new Int32Array(this.entries.length);
  }

  get size(): number {
    return this.entries.length;
  }

  /** The best match score for the query, 0 to 100; see `memoryMatchScore`. */
  bestScore(sourceText: string): number {
    if (this.exact.has(sourceText)) return 100;
    const query = normalizeTranslationMemorySourceText(sourceText);
    const queryGrams = bigrams(query);
    const queryLength = Array.from(query).length;
    // The ids of the entries within the length ratio of the query.
    const first = this.firstIdOfLength(Math.ceil(queryLength * MIN_LENGTH_RATIO));
    const end = this.firstIdOfLength(Math.floor(queryLength / MIN_LENGTH_RATIO) + 1);
    const { sharedCounts, counted } = this;
    let countedCount = 0;
    for (const gram of queryGrams) {
      const posting = this.postings.get(gram);
      if (!posting) continue;
      for (let i = lowerBound(posting, first); i < posting.length && posting[i] < end; i++) {
        const id = posting[i];
        if (sharedCounts[id]++ === 0) counted[countedCount++] = id;
      }
    }
    const candidates: Candidate[] = [];
    for (let i = 0; i < countedCount; i++) {
      const id = counted[i];
      candidates.push({
        text: this.entries[id],
        length: this.lengths[id],
        grams: this.gramCounts[id],
        shared: sharedCounts[id],
      });
      sharedCounts[id] = 0;
    }
    const score = bestCandidateScore(query, queryLength, queryGrams.size, candidates);
    return Math.min(
      99,
      shortQueryScore(
        query,
        queryLength,
        score,
        idRange(first, end),
        this.entries,
        this.lengths,
        // A short query's length window holds only short entries.
        (id) => this.shortChars[id],
      ),
    );
  }

  private firstIdOfLength(length: number): number {
    if (length <= 0) return 0;
    return length < this.firstOfLength.length ? this.firstOfLength[length] : this.entries.length;
  }
}

function* idRange(first: number, end: number): Generator<number> {
  for (let id = first; id < end; id++) yield id;
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
  /** Raw source texts: only an exact copy is a 100% match. */
  private readonly exact = new Set<string>();
  private readonly normalizedSeen = new Set<string>();

  constructor(sourceTexts: Iterable<string>) {
    for (const text of sourceTexts) {
      this.exact.add(text);
      const normalized = normalizeTranslationMemorySourceText(text);
      if (this.normalizedSeen.has(normalized)) continue;
      this.normalizedSeen.add(normalized);
      this.entries.push(normalized);
      this.lengths.push(Array.from(normalized).length);
      this.gramCounts.push(bigramKeys(normalized).length);
    }
  }

  /** The best match score for the query, 0 to 100; see `memoryMatchScore`. */
  bestScore(sourceText: string): number {
    if (this.exact.has(sourceText)) return 100;
    const query = normalizeTranslationMemorySourceText(sourceText);
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
    const score = bestCandidateScore(query, queryLength, slots.size, candidates);
    return Math.min(
      99,
      shortQueryScore(
        query,
        queryLength,
        score,
        this.entries.keys(),
        this.entries,
        this.lengths,
        (id) => distinctChars(this.entries[id]),
      ),
    );
  }
}
