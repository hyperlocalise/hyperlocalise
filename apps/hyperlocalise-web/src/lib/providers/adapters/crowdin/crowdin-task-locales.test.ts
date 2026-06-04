import { describe, expect, it } from "vite-plus/test";

import {
  extractCrowdinTaskPrimaryLanguageId,
  extractCrowdinTaskSourceLanguageId,
  extractCrowdinTaskTargetLocales,
} from "./crowdin-task-locales";

describe("crowdin task locales", () => {
  it("prefers targetLanguages over legacy languageId", () => {
    expect(
      extractCrowdinTaskTargetLocales({
        languageId: null,
        targetLanguageId: "de",
        targetLanguages: [{ id: "fr" }, { id: "es" }],
      }),
    ).toEqual(["fr", "es"]);
  });

  it("falls back to targetLanguageId then languageId", () => {
    expect(
      extractCrowdinTaskTargetLocales({
        languageId: "it",
        targetLanguageId: "de",
      }),
    ).toEqual(["de"]);

    expect(
      extractCrowdinTaskTargetLocales({
        languageId: "it",
      }),
    ).toEqual(["it"]);
  });

  it("extracts source and primary language ids", () => {
    expect(
      extractCrowdinTaskSourceLanguageId({
        sourceLanguageId: "en",
      }),
    ).toBe("en");

    expect(
      extractCrowdinTaskPrimaryLanguageId({
        targetLanguageId: "fr",
        languageId: "de",
      }),
    ).toBe("fr");
  });
});
