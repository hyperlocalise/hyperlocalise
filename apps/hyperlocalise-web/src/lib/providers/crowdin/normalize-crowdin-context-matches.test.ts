import { describe, expect, it } from "vite-plus/test";

import {
  mergeTranslationContextMatches,
  normalizeCrowdinGlossaryConcordanceMatches,
  normalizeCrowdinTranslationMemoryConcordanceMatches,
} from "./normalize-crowdin-context-matches";

describe("normalizeCrowdinGlossaryConcordanceMatches", () => {
  it("maps concordance hits into agent glossary context rows", () => {
    const rows = normalizeCrowdinGlossaryConcordanceMatches(
      [
        {
          glossary: { id: 4, name: "Product glossary" },
          concept: { id: 9 },
          sourceTerms: [{ text: "checkout", status: "preferred" }],
          targetTerms: [{ text: "paiement", languageId: "fr", status: "preferred" }],
        },
      ],
      { targetLocale: "fr" },
    );

    expect(rows).toEqual([
      {
        id: "crowdin:glossary:4:concept:9:target:fr",
        glossaryId: "crowdin:4",
        glossaryName: "Product glossary",
        sourceTerm: "checkout",
        targetTerm: "paiement",
        targetLocale: "fr",
        description: null,
        forbidden: null,
        rank: 100,
      },
    ]);
  });

  it("returns an empty list when glossary metadata is missing", () => {
    expect(
      normalizeCrowdinGlossaryConcordanceMatches(
        [
          {
            glossary: null,
            sourceTerms: [{ text: "save" }],
            targetTerms: [{ text: "enregistrer" }],
          },
        ],
        { targetLocale: "fr" },
      ),
    ).toEqual([]);
  });
});

describe("normalizeCrowdinTranslationMemoryConcordanceMatches", () => {
  it("prefers substituted target text and preserves relevance score", () => {
    const rows = normalizeCrowdinTranslationMemoryConcordanceMatches(
      [
        {
          tm: { id: 12, name: "Product TM" },
          recordId: 44,
          source: "Sign in",
          target: "Se connecter",
          substituted: "Connexion",
          relevant: 92,
        },
      ],
      { targetLocale: "fr" },
    );

    expect(rows).toEqual([
      {
        id: "crowdin:tm:crowdin:12:record:44",
        memoryId: "crowdin:12",
        sourceText: "Sign in",
        targetText: "Connexion",
        targetLocale: "fr",
        provenance: "crowdin_concordance",
        matchScore: 92,
        rank: 100,
      },
    ]);
  });

  it("skips incomplete TM matches", () => {
    expect(
      normalizeCrowdinTranslationMemoryConcordanceMatches(
        [{ tm: { id: 1, name: "TM" }, source: " ", target: "Bonjour" }],
        { targetLocale: "fr" },
      ),
    ).toEqual([]);
  });

  it("returns an empty list when TM metadata is missing", () => {
    expect(
      normalizeCrowdinTranslationMemoryConcordanceMatches(
        [{ tm: null, source: "Hello", target: "Bonjour" }],
        { targetLocale: "fr" },
      ),
    ).toEqual([]);
  });
});

describe("mergeTranslationContextMatches", () => {
  it("deduplicates by id and respects the limit", async () => {
    const merged = mergeTranslationContextMatches(
      [{ id: "a", rank: 90 }],
      [
        { id: "a", rank: 50 },
        { id: "b", rank: 80 },
        { id: "c", rank: 70 },
      ],
      2,
    );

    expect(merged).toEqual([
      { id: "a", rank: 90 },
      { id: "b", rank: 80 },
    ]);
  });

  it("keeps the highest ranked matches before applying the limit", () => {
    const merged = mergeTranslationContextMatches(
      [
        { id: "low-1", rank: 10 },
        { id: "low-2", rank: 20 },
      ],
      [{ id: "high", rank: 100 }],
      2,
    );

    expect(merged).toEqual([
      { id: "high", rank: 100 },
      { id: "low-2", rank: 20 },
    ]);
  });
});
