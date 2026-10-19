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

import { MemoryMatchIndex, sourceSimilarity } from "./memory-match-index";

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

  it("deduplicates entries and reports its size", () => {
    expect(new MemoryMatchIndex(["a b", "A  B", "c"]).size).toBe(2);
  });
});
