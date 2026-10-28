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
import { describe, expect, it } from "vite-plus/test";

import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import {
  MemoryMatchIndex,
  MemorySourceScan,
  memoryMatchScore,
  sourceSimilarity,
} from "./memory-match-index";

/** Edit similarity worked out over the whole table, with no shortcuts. */
function plainSimilarity(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length === 0 && b.length === 0) return 100;
  if (a.length === 0 || b.length === 0) return 0;
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
  return Math.floor(100 * (1 - previous[b.length] / Math.max(a.length, b.length)));
}

/**
 * The matching rules read plainly: of the entries within half to twice the query's length, the
 * `limit` sharing the most bigrams relative to both sizes (Dice, ties to the lowest text) are
 * scored by edit similarity; a short query below the lowest band is also ranked by shared
 * characters.
 */
function plainBestScore(sources: string[], sourceText: string, limit = 64): number {
  if (sources.includes(sourceText)) return 100;
  const query = normalizeTranslationMemorySourceText(sourceText);
  const entries = [...new Set(sources.map(normalizeTranslationMemorySourceText))];
  const length = (text: string) => Array.from(text).length;
  const bigramsOf = (text: string) => {
    const chars = Array.from(text);
    if (chars.length === 1) return new Set(chars);
    return new Set(chars.slice(1).map((char, i) => chars[i] + char));
  };
  const charsOf = (text: string) => new Set(Array.from(text));
  const best = (piecesOf: (text: string) => Set<string>) => {
    const queryPieces = piecesOf(query);
    const ranked = entries
      .filter(
        (entry) =>
          Math.min(length(entry), length(query)) >= 0.5 * Math.max(length(entry), length(query)),
      )
      .map((entry) => {
        const pieces = piecesOf(entry);
        const shared = [...pieces].filter((piece) => queryPieces.has(piece)).length;
        return { entry, shared, dice: (2 * shared) / (queryPieces.size + pieces.size) };
      })
      .filter((candidate) => candidate.shared > 0)
      .sort(
        (left, right) =>
          right.dice - left.dice ||
          (left.entry < right.entry ? -1 : left.entry > right.entry ? 1 : 0),
      )
      .slice(0, limit);
    return Math.max(0, ...ranked.map((candidate) => plainSimilarity(query, candidate.entry)));
  };
  let score = best(bigramsOf);
  if (score < 50 && length(query) <= 8) score = Math.max(score, best(charsOf));
  return Math.min(99, score);
}

/** A seeded generator (mulberry32), so a failure can be run again. */
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe("memoryMatchScore", () => {
  it("is 100 only for the same text, as translation reuse requires", () => {
    expect(memoryMatchScore("Save", "Save")).toBe(100);
    expect(memoryMatchScore("Save", "save")).toBe(99);
    expect(memoryMatchScore("Save and close", "Save & close")).toBeLessThan(95);
  });
});

describe("sourceSimilarity", () => {
  it("scores identical text as 100 and unrelated text low", () => {
    expect(sourceSimilarity("hello world", "hello world")).toBe(100);
    expect(sourceSimilarity("hello world", "hello worlds")).toBeGreaterThan(80);
    expect(sourceSimilarity("hello", "")).toBe(0);
    expect(sourceSimilarity("", "")).toBe(100);
  });
});

describe("MemoryMatchIndex", () => {
  const index = new MemoryMatchIndex([
    "Hello world",
    "Save and close",
    "Please confirm your payment details",
    "日本語の翻訳を確認してください",
    ...Array.from({ length: 500 }, (_, i) => `Checkout step ${i} confirm payment`),
  ]);

  it("scores only an exact copy of the source text as 100", () => {
    expect(index.bestScore("Hello world")).toBe(100);
  });

  it("scores text that differs only in case or spacing as 99, not 100", () => {
    expect(index.bestScore("hello  WORLD")).toBe(99);
    expect(index.bestScore("Hello world ")).toBe(99);
  });

  it("finds a match when a word is added, removed or changed", () => {
    expect(index.bestScore("Hello brave world")).toBeGreaterThanOrEqual(60);
    expect(index.bestScore("Save close")).toBeGreaterThanOrEqual(70);
    expect(index.bestScore("Save and open")).toBeGreaterThanOrEqual(70);
  });

  it("finds a one-letter typo of a long sentence as a high match", () => {
    expect(index.bestScore("Please confirm your paymant details")).toBeGreaterThanOrEqual(95);
  });

  it("matches CJK text by characters", () => {
    expect(index.bestScore("日本語の翻訳を確認して下さい")).toBeGreaterThanOrEqual(85);
  });

  it("scores unrelated text as new", () => {
    expect(index.bestScore("Quarterly revenue grew by twelve percent")).toBeLessThan(50);
  });

  it("finds a near-identical short entry among many longer entries that contain the query", () => {
    const longer = Array.from({ length: 80 }, (_, i) => `Account settings page ${i}`);
    const alone = new MemoryMatchIndex(["Account settin"]).bestScore("Account settings");
    expect(alone).toBe(87);
    expect(new MemoryMatchIndex([...longer, "Account settin"]).bestScore("Account settings")).toBe(
      alone,
    );
    expect(new MemorySourceScan([...longer, "Account settin"]).bestScore("Account settings")).toBe(
      alone,
    );
  });

  it("finds a short typo that shares no bigram with the entry", () => {
    const entries = [
      "Yes",
      "Edit",
      "aybycydy",
      ...Array.from({ length: 200 }, (_, i) => `Yellow ${i}`),
    ];
    for (const [query, entry] of [
      ["Yas", "Yes"],
      ["Exot", "Edit"],
      // Eight characters, the longest query compared by shared characters.
      ["axbxcxdx", "aybycydy"],
    ]) {
      const expected = sourceSimilarity(query, entry);
      expect(expected).toBeGreaterThanOrEqual(50);
      expect(new MemoryMatchIndex(entries).bestScore(query), query).toBe(expected);
      expect(new MemorySourceScan(entries).bestScore(query), query).toBe(expected);
    }
  });

  it("compares a shorter entry whose length allows just one point more than the best so far", () => {
    const query = Array.from({ length: 100 }, (_, i) =>
      String.fromCharCode(97 + ((i * 7) % 26)),
    ).join("");
    // The same length, 20 letters changed: 80. The first 81 letters: 19 removed, so 81.
    const changed = Array.from(query, (char, i) => (i % 5 === 0 ? "0" : char)).join("");
    const prefix = query.slice(0, 81);
    expect(sourceSimilarity(query, changed)).toBe(80);
    expect(new MemoryMatchIndex([changed, prefix]).bestScore(query)).toBe(81);
    expect(new MemorySourceScan([changed, prefix]).bestScore(query)).toBe(81);
  });

  it("compares the 64th of entries tied on shared bigrams, and no more", () => {
    // 64 entries share the same bigrams with the query; the closest sorts last by text.
    const letters = Array.from("ijklmnopqrstuvw");
    const tied = letters
      .flatMap((first) =>
        letters.filter((second) => second !== first).map((second) => first + second),
      )
      .slice(0, 63)
      .map((pair) => `abcd${pair}yz`);
    const entries = [...tied, "abcdxfxh"];
    expect(sourceSimilarity("abcdefgh", "abcdxfxh")).toBe(75);
    expect(new MemoryMatchIndex(entries).bestScore("abcdefgh")).toBe(75);
    expect(new MemorySourceScan(entries).bestScore("abcdefgh")).toBe(75);
  });

  it("deduplicates entries and reports its size", () => {
    expect(new MemoryMatchIndex(["a b", "A  B", "c"]).size).toBe(2);
  });
});

describe("MemorySourceScan", () => {
  const sources = [
    "Download the translated files once every language has been approved",
    "Save your changes before you leave this page or they will be lost",
    "日本語の翻訳を確認してください",
    "a",
    ...Array.from({ length: 500 }, (_, i) => `Checkout step ${i} confirm payment`),
  ];
  const index = new MemoryMatchIndex(sources);
  const scan = new MemorySourceScan(sources);

  it("gives the same scores as the index", () => {
    const queries = [
      "download the translated files once every language has been approved",
      "Dxwnlxad txe traxslaxed fxles oxce exery lxnguxge hxs beex appxoved",
      "Save your changes before you leave this page",
      "日本語の翻訳を確認して下さい",
      "Checkout step 12 confirm paymant",
      "Quarterly revenue grew by twelve percent",
      "a",
      "b",
      "",
    ];
    for (const query of queries) {
      expect(scan.bestScore(query), query).toBe(index.bestScore(query));
    }
    expect(
      scan.bestScore("Dxwnlxad txe traxslaxed fxles oxce exery lxnguxge hxs beex appxoved"),
    ).toBe(80);
  });

  it("scores the same whatever order the entries were loaded in", () => {
    // More entries tie on shared bigrams than are scored, and the closest one sorts first by text.
    const tied = [
      "aaaa bbbb",
      ...Array.from({ length: 100 }, (_, i) => `bbbb aaaa b${String(i).padStart(3, "0")}`),
    ];
    const reversed = [...tied].reverse();
    const query = "aaaa bbbc";
    const expected = new MemoryMatchIndex(tied).bestScore(query);
    expect(expected).toBe(sourceSimilarity(query, "aaaa bbbb"));
    expect(new MemoryMatchIndex(reversed).bestScore(query)).toBe(expected);
    expect(new MemorySourceScan(tied).bestScore(query)).toBe(expected);
    expect(new MemorySourceScan(reversed).bestScore(query)).toBe(expected);
  });
});

describe("random memories", () => {
  // Small alphabets force ties and shared bigrams; the others cover two-unit characters, lone
  // surrogates, combining marks, full-width letters that normalizing changes, and Japanese.
  const alphabets = [
    ["a", "b"],
    Array.from("abc "),
    Array.from("abcdefghij "),
    Array.from("aAbB  \t"),
    ["😀", "👍", "a", " "],
    ["\ud83d", "\ude00", "😀", "a"],
    ["e", "́", "é", " "],
    ["Ａ", "A", "ｂ", "b", " "],
    Array.from("日本語の翻訳を確認"),
  ];

  it("scores as the plain rules do, in the index and the scan", () => {
    const random = seededRandom(20261028);
    const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
    const text = (alphabet: string[], longest: number) =>
      Array.from({ length: Math.floor(random() * (longest + 1)) }, () => pick(alphabet)).join("");
    const edited = (source: string, alphabet: string[]) => {
      const chars = Array.from(source);
      const at = Math.floor(random() * (chars.length + 1));
      if (random() < 0.5 && chars.length > 0) chars.splice(Math.min(at, chars.length - 1), 1);
      else chars.splice(at, 0, pick(alphabet));
      return chars.join("");
    };
    // Lookups whose score depends on which 64 candidates are kept, so the ranking is tested.
    let rankingDecides = 0;
    for (let memory = 0; memory < 300; memory++) {
      const alphabet = pick(alphabets);
      const longest = pick([1, 3, 6, 12, 40, 150]);
      const sources = Array.from({ length: pick([0, 1, 3, 20, 90, 300]) }, () =>
        text(alphabet, longest),
      );
      // Copies that differ only in case and outer spaces: normalizing merges them with their
      // originals, while only the raw text is an exact match.
      sources.push(...sources.slice(0, 5).map((source) => ` ${source.toUpperCase()} `));
      const index = new MemoryMatchIndex(sources);
      const scan = new MemorySourceScan(sources);
      for (let lookup = 0; lookup < 8; lookup++) {
        const query =
          sources.length > 0 && random() < 0.6
            ? edited(pick(sources), alphabet)
            : text(alphabet, longest);
        const expected = plainBestScore(sources, query);
        const lookupCase = JSON.stringify({ sources, query });
        expect(index.bestScore(query), lookupCase).toBe(expected);
        expect(scan.bestScore(query), lookupCase).toBe(expected);
        if (sources.length > 64 && plainBestScore(sources, query, Infinity) !== expected) {
          rankingDecides++;
        }
        const other = text(alphabet, longest);
        expect(sourceSimilarity(query, other), JSON.stringify({ query, other })).toBe(
          plainSimilarity(query, other),
        );
      }
    }
    expect(rankingDecides).toBeGreaterThan(0);
  });
});
