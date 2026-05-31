import { describe, expect, it } from "vite-plus/test";

import {
  buildPhraseKeyExternalResourceId,
  buildPhraseKeySourcePath,
  mapPhraseTranslationReadiness,
} from "./phrase-locale-readiness";

describe("phrase locale readiness", () => {
  it("maps translated content to ready", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "Bonjour",
        state: "translated",
        unverified: false,
        excluded: false,
      }),
    ).toBe("ready");
  });

  it("maps empty content to missing", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "",
        state: "translated",
        unverified: false,
        excluded: false,
      }),
    ).toBe("missing");
  });

  it("maps non-translated content to unverified", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "Draft copy",
        state: "draft",
        unverified: false,
        excluded: false,
      }),
    ).toBe("unverified");
  });

  it("maps unverified translated content to unverified", () => {
    expect(
      mapPhraseTranslationReadiness({
        content: "Bonjour",
        state: "translated",
        unverified: true,
        excluded: false,
      }),
    ).toBe("unverified");
  });

  it("scopes key identity by branch when present", () => {
    expect(buildPhraseKeyExternalResourceId("key-1", "feature")).toBe("feature::key-1");
    expect(buildPhraseKeyExternalResourceId("key-1", null)).toBe("key-1");
    expect(buildPhraseKeySourcePath("home.hero.title", null)).toBe("keys/home.hero.title");
    expect(buildPhraseKeySourcePath("home.hero.title", "feature")).toBe(
      "feature/keys/home.hero.title",
    );
  });
});
