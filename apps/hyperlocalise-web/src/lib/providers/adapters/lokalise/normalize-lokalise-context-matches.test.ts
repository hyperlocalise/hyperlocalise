import { describe, expect, it } from "vite-plus/test";

import type { LokaliseGlossaryTerm, LokaliseKey } from "./lokalise-api";
import {
  buildLokaliseProjectGlossaryExternalId,
  buildLokaliseProjectTranslationMemoryExternalId,
  buildLokaliseTranslationMemorySegmentCandidates,
  matchesLokaliseGlossaryTerm,
  pickLokaliseGlossaryTranslation,
  scoreLokaliseTextMatch,
} from "./normalize-lokalise-context-matches";

describe("scoreLokaliseTextMatch", () => {
  it("scores exact matches highest", () => {
    expect(scoreLokaliseTextMatch("Hello world", "Hello world")).toBe(100);
  });

  it("scores partial overlap for glossary-style terms", () => {
    expect(scoreLokaliseTextMatch("checkout button", "button")).toBeGreaterThanOrEqual(70);
  });
});

describe("matchesLokaliseGlossaryTerm", () => {
  it("respects case sensitivity when enabled", () => {
    const term: Pick<LokaliseGlossaryTerm, "term" | "caseSensitive"> = {
      term: "Checkout",
      caseSensitive: true,
    };

    expect(matchesLokaliseGlossaryTerm("checkout", term)).toBe(false);
    expect(matchesLokaliseGlossaryTerm("Checkout", term)).toBe(true);
  });

  it("matches case-sensitive terms embedded in longer source text", () => {
    const term: Pick<LokaliseGlossaryTerm, "term" | "caseSensitive"> = {
      term: "iOS",
      caseSensitive: true,
    };

    expect(matchesLokaliseGlossaryTerm("Update iOS settings", term)).toBe(true);
    expect(matchesLokaliseGlossaryTerm("Update ios settings", term)).toBe(false);
  });
});

describe("pickLokaliseGlossaryTranslation", () => {
  it("resolves target locale from language id map", () => {
    const term: LokaliseGlossaryTerm = {
      id: 10,
      term: "Checkout",
      description: null,
      caseSensitive: false,
      translatable: true,
      forbidden: false,
      tags: [],
      translations: [
        {
          id: 1,
          languageId: 640,
          languageIdSnake: 640,
          languageIso: "",
          languageIsoSnake: "",
          langIso: "",
          langIsoSnake: "",
          translation: "Paiement",
          description: null,
        },
      ],
    };

    const target = pickLokaliseGlossaryTranslation(term, "fr", new Map([[640, "fr"]]));
    expect(target).toBe("Paiement");
  });
});

describe("buildLokaliseTranslationMemorySegmentCandidates", () => {
  it("returns scored key translation pairs for the requested locale", () => {
    const keys: LokaliseKey[] = [
      {
        keyId: 42,
        keyName: { web: "greeting", ios: "", android: "", other: "" },
        filenames: { web: "", ios: "", android: "", other: "" },
        description: null,
        context: null,
        platforms: [],
        tags: [],
        isPlural: false,
        isHidden: false,
        isArchived: false,
        createdAt: null,
        modifiedAt: null,
        translationsModifiedAt: null,
        translations: [
          {
            translationId: 1,
            keyId: 42,
            languageIso: "en",
            translation: "Hello",
            modifiedAt: null,
            modifiedAtTimestamp: null,
            isReviewed: true,
            isUnverified: false,
          },
          {
            translationId: 2,
            keyId: 42,
            languageIso: "fr",
            translation: "Bonjour",
            modifiedAt: null,
            modifiedAtTimestamp: null,
            isReviewed: true,
            isUnverified: false,
          },
        ],
      },
    ];

    const matches = buildLokaliseTranslationMemorySegmentCandidates(keys, {
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
      limit: 5,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      keyId: 42,
      sourceText: "Hello",
      targetText: "Bonjour",
      matchScore: 100,
    });
  });

  it("skips segments without a target translation", () => {
    const keys: LokaliseKey[] = [
      {
        keyId: 7,
        keyName: { web: "title", ios: "", android: "", other: "" },
        filenames: { web: "", ios: "", android: "", other: "" },
        description: null,
        context: null,
        platforms: [],
        tags: [],
        isPlural: false,
        isHidden: false,
        isArchived: false,
        createdAt: null,
        modifiedAt: null,
        translationsModifiedAt: null,
        translations: [
          {
            translationId: 1,
            keyId: 7,
            languageIso: "en",
            translation: "Title",
            modifiedAt: null,
            modifiedAtTimestamp: null,
            isReviewed: true,
            isUnverified: false,
          },
        ],
      },
    ];

    expect(
      buildLokaliseTranslationMemorySegmentCandidates(keys, {
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Title",
        limit: 5,
      }),
    ).toEqual([]);
  });
});

describe("external resource ids", () => {
  it("builds stable project-scoped ids", () => {
    expect(buildLokaliseProjectGlossaryExternalId("proj.123")).toBe("proj.123:glossary");
    expect(buildLokaliseProjectTranslationMemoryExternalId("proj.123")).toBe(
      "proj.123:translation-memory",
    );
  });
});
