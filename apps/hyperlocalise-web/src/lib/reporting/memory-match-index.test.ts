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

import { MemoryMatchIndex, MemorySourceScan, sourceSimilarity } from "./memory-match-index";

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

  it("finds exact matches ignoring case and spacing", () => {
    expect(index.bestScore("hello  WORLD")).toBe(100);
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
    const entries = ["Yes", "Edit", ...Array.from({ length: 200 }, (_, i) => `Yellow ${i}`)];
    for (const [query, entry] of [
      ["Yas", "Yes"],
      ["Exot", "Edit"],
    ]) {
      const expected = sourceSimilarity(query, entry);
      expect(expected).toBeGreaterThanOrEqual(50);
      expect(new MemoryMatchIndex(entries).bestScore(query), query).toBe(expected);
      expect(new MemorySourceScan(entries).bestScore(query), query).toBe(expected);
    }
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
