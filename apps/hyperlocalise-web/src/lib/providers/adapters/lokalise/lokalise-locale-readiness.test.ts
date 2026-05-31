import { describe, expect, it } from "vite-plus/test";

import {
  buildLokaliseFileExternalResourceId,
  buildLokaliseFileSourcePath,
  buildLokaliseKeyExternalResourceId,
  buildLokaliseKeySourcePath,
  mapLokaliseTranslationReadiness,
} from "./lokalise-locale-readiness";

describe("lokalise locale readiness", () => {
  it("maps reviewed content to ready", () => {
    expect(
      mapLokaliseTranslationReadiness({
        content: "Bonjour",
        isUnverified: false,
        isReviewed: true,
        isArchived: false,
        isHidden: false,
      }),
    ).toBe("ready");
  });

  it("maps empty content to missing", () => {
    expect(
      mapLokaliseTranslationReadiness({
        content: "",
        isUnverified: false,
        isReviewed: true,
        isArchived: false,
        isHidden: false,
      }),
    ).toBe("missing");
  });

  it("maps unverified translated content to unverified", () => {
    expect(
      mapLokaliseTranslationReadiness({
        content: "Draft copy",
        isUnverified: true,
        isReviewed: false,
        isArchived: false,
        isHidden: false,
      }),
    ).toBe("unverified");
  });

  it("maps archived or hidden keys to excluded", () => {
    expect(
      mapLokaliseTranslationReadiness({
        content: "Bonjour",
        isUnverified: false,
        isReviewed: true,
        isArchived: true,
        isHidden: false,
      }),
    ).toBe("excluded");
    expect(
      mapLokaliseTranslationReadiness({
        content: "Bonjour",
        isUnverified: false,
        isReviewed: true,
        isArchived: false,
        isHidden: true,
      }),
    ).toBe("excluded");
  });

  it("uses stable key and file identity helpers", () => {
    expect(buildLokaliseKeyExternalResourceId(4242)).toBe("4242");
    expect(buildLokaliseKeySourcePath("home.hero.title", "locales/en/home.json")).toBe(
      "files/locales/en/home.json/keys/home.hero.title",
    );
    expect(buildLokaliseKeySourcePath("home.hero.title", null)).toBe("keys/home.hero.title");
    expect(buildLokaliseFileExternalResourceId("web", "locales/en/home.json")).toBe(
      "web::locales/en/home.json",
    );
    expect(buildLokaliseFileSourcePath("en", "web", "locales/en/home.json")).toBe(
      "locales/en/web/locales/en/home.json",
    );
  });
});
