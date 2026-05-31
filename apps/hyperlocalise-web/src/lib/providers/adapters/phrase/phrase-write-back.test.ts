import { describe, expect, it } from "vite-plus/test";

import { buildPhraseTranslationWriteBackGroups } from "./phrase-write-back";

describe("buildPhraseTranslationWriteBackGroups", () => {
  it("groups translations by locale and preserves branch and job tag context", () => {
    const result = buildPhraseTranslationWriteBackGroups({
      branch: "main",
      jobTag: "hyperlocalise:job:phrase-job-1",
      defaultTargetLocale: "fr-FR",
      translations: [
        { locale: "fr-FR", key: "hello", text: "Bonjour" },
        { locale: "fr-FR", externalStringId: "key-2", text: "Monde" },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.groups).toEqual([
      {
        locale: "fr-FR",
        branch: "main",
        jobTag: "hyperlocalise:job:phrase-job-1",
        entries: [
          {
            key: "hello",
            keyId: null,
            locale: "fr-FR",
            text: "Bonjour",
            branch: "main",
            jobTag: "hyperlocalise:job:phrase-job-1",
          },
          {
            key: "key-2",
            keyId: "key-2",
            locale: "fr-FR",
            text: "Monde",
            branch: "main",
            jobTag: "hyperlocalise:job:phrase-job-1",
          },
        ],
      },
    ]);
  });

  it("records validation failures for incomplete uploads", () => {
    const result = buildPhraseTranslationWriteBackGroups({
      branch: null,
      jobTag: null,
      defaultTargetLocale: null,
      translations: [
        { locale: "", key: "hello", text: "Bonjour" },
        { locale: "fr-FR", key: "", text: "Monde" },
        { locale: "fr-FR", key: "world", text: "   " },
      ],
    });

    expect(result.groups).toEqual([]);
    expect(result.failures).toEqual([
      { locale: "", fileId: null, message: "phrase_translation_missing_locale" },
      { locale: "fr-FR", fileId: null, message: "phrase_translation_missing_key" },
      { locale: "fr-FR", fileId: null, message: "phrase_translation_missing_text" },
    ]);
  });
});
