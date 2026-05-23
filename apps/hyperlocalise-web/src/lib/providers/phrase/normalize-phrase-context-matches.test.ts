import { describe, expect, it } from "vite-plus/test";

import {
  normalizePhraseMatchScore,
  normalizePhraseTranslationMemorySearchMatches,
} from "./normalize-phrase-context-matches";

describe("normalizePhraseMatchScore", () => {
  it("converts fractional Phrase scores to 0-100", () => {
    expect(normalizePhraseMatchScore(0.85)).toBe(85);
    expect(normalizePhraseMatchScore(0)).toBe(0);
    expect(normalizePhraseMatchScore(1)).toBe(100);
  });

  it("clamps already-percent scores", () => {
    expect(normalizePhraseMatchScore(92)).toBe(92);
    expect(normalizePhraseMatchScore(150)).toBe(100);
    expect(normalizePhraseMatchScore(-5)).toBe(0);
  });

  it("returns null for missing or non-finite scores", () => {
    expect(normalizePhraseMatchScore(null)).toBeNull();
    expect(normalizePhraseMatchScore(undefined)).toBeNull();
    expect(normalizePhraseMatchScore(Number.NaN)).toBeNull();
  });
});

describe("normalizePhraseTranslationMemorySearchMatches", () => {
  const memoryIdByExternalUid = new Map([["tm-uid-1", "memory_local_1"]]);

  it("maps attached memories into agent context matches", () => {
    const matches = normalizePhraseTranslationMemorySearchMatches(
      [
        {
          transMemoryUid: "tm-uid-1",
          transMemoryName: "Product TM",
          segmentId: "seg-1",
          sourceText: "Hello",
          targetText: "Bonjour",
          targetLocale: "fr-FR",
          score: 0.91,
        },
      ],
      { targetLocale: "fr-FR", memoryIdByExternalUid },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      memoryId: "memory_local_1",
      memoryName: "Product TM",
      sourceText: "Hello",
      targetText: "Bonjour",
      matchScore: 91,
      matchSource: "live_provider",
      providerKind: "phrase",
      externalResourceId: "tm-uid-1",
    });
  });

  it("skips matches for memories that are not synced locally", () => {
    const matches = normalizePhraseTranslationMemorySearchMatches(
      [
        {
          transMemoryUid: "unknown-tm",
          transMemoryName: null,
          segmentId: null,
          sourceText: "Hello",
          targetText: "Bonjour",
          targetLocale: "fr-FR",
          score: 0.8,
        },
      ],
      { targetLocale: "fr-FR", memoryIdByExternalUid },
    );

    expect(matches).toEqual([]);
  });

  it("filters by target locale when provided on the match", () => {
    const matches = normalizePhraseTranslationMemorySearchMatches(
      [
        {
          transMemoryUid: "tm-uid-1",
          transMemoryName: null,
          segmentId: null,
          sourceText: "Hello",
          targetText: "Hola",
          targetLocale: "es-ES",
          score: 0.8,
        },
      ],
      { targetLocale: "fr-FR", memoryIdByExternalUid },
    );

    expect(matches).toEqual([]);
  });
});
