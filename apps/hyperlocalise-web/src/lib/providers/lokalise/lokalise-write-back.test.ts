import { describe, expect, it } from "vite-plus/test";

import { buildLokaliseTranslationWriteBackBatches } from "./lokalise-write-back";

describe("buildLokaliseTranslationWriteBackBatches", () => {
  it("groups translations by key id and marks approved uploads as reviewed", () => {
    const result = buildLokaliseTranslationWriteBackBatches({
      defaultTargetLocale: "fr",
      translations: [
        { locale: "fr", externalStringId: "4242", key: "hello", text: "Bonjour" },
        { locale: "de", externalStringId: "4242", text: "Hallo" },
        { locale: "", externalStringId: "7777", key: "world", text: "Monde" },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.batches).toEqual([
      {
        keyId: 4242,
        translations: [
          {
            languageIso: "fr",
            translation: "Bonjour",
            isUnverified: false,
            isReviewed: true,
          },
          {
            languageIso: "de",
            translation: "Hallo",
            isUnverified: false,
            isReviewed: true,
          },
        ],
      },
      {
        keyId: 7777,
        translations: [
          {
            languageIso: "fr",
            translation: "Monde",
            isUnverified: false,
            isReviewed: true,
          },
        ],
      },
    ]);
  });

  it("records validation failures for incomplete uploads", () => {
    const result = buildLokaliseTranslationWriteBackBatches({
      defaultTargetLocale: null,
      translations: [
        { locale: "", key: "hello", text: "Bonjour" },
        { locale: "fr-FR", externalStringId: "4242", text: "   " },
        { locale: "fr-FR", key: "world", text: "Salut" },
      ],
    });

    expect(result.batches).toEqual([]);
    expect(result.failures).toEqual([
      { locale: "", fileId: null, message: "lokalise_translation_missing_locale" },
      { locale: "fr-FR", fileId: null, message: "lokalise_translation_missing_text" },
      { locale: "fr-FR", fileId: null, message: "lokalise_translation_missing_key_id" },
    ]);
  });
});
