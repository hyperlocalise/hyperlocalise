import { describe, expect, it } from "vite-plus/test";

import {
  buildSmartlingTranslationMemoryCandidates,
  matchesSmartlingGlossaryEntry,
} from "./normalize-smartling-context-matches";
import { pickSmartlingGlossaryTranslation, scoreSmartlingTextMatch } from "./smartling-api";

describe("scoreSmartlingTextMatch", () => {
  it("scores exact matches highest", () => {
    expect(scoreSmartlingTextMatch("Hello world", "Hello world")).toBe(100);
  });

  it("returns zero for empty candidates", () => {
    expect(scoreSmartlingTextMatch("Hello", "")).toBe(0);
  });
});

describe("matchesSmartlingGlossaryEntry", () => {
  it("matches glossary terms that overlap with the source text", () => {
    expect(
      matchesSmartlingGlossaryEntry("Save your work", {
        entryUid: "entry-1",
        term: "Save",
        definition: null,
        partOfSpeech: null,
        translations: [],
      }),
    ).toBe(true);
  });
});

describe("pickSmartlingGlossaryTranslation", () => {
  it("returns the translation for the requested locale", () => {
    expect(
      pickSmartlingGlossaryTranslation(
        {
          entryUid: "entry-1",
          term: "Save",
          definition: null,
          partOfSpeech: null,
          translations: [{ localeId: "fr-FR", term: "Enregistrer", notes: null, definition: null }],
        },
        "fr-FR",
      ),
    ).toBe("Enregistrer");
  });
});

describe("buildSmartlingTranslationMemoryCandidates", () => {
  it("builds scored TM candidates for the target locale", () => {
    const candidates = buildSmartlingTranslationMemoryCandidates(
      [
        {
          entryUid: "entry-1",
          sourceText: "Hello",
          sourceLocaleId: "en-US",
          translations: [{ targetLocaleId: "fr-FR", translationText: "Bonjour" }],
        },
      ],
      {
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        sourceText: "Hello",
        limit: 5,
      },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      entryUid: "entry-1",
      sourceText: "Hello",
      targetText: "Bonjour",
      matchScore: 100,
    });
  });

  it("returns no candidates when the target locale is missing", () => {
    const candidates = buildSmartlingTranslationMemoryCandidates(
      [
        {
          entryUid: "entry-1",
          sourceText: "Hello",
          sourceLocaleId: "en-US",
          translations: [{ targetLocaleId: "de-DE", translationText: "Hallo" }],
        },
      ],
      {
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        sourceText: "Hello",
        limit: 5,
      },
    );

    expect(candidates).toEqual([]);
  });
});
