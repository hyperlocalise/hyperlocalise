import { describe, expect, it } from "vite-plus/test";

import {
  canonicalizeLocale,
  COMMON_LOCALES,
  getLocaleLabel,
  isRtlLocale,
  normalizeProjectLocales,
  normalizeTargetLocales,
} from "./locales";

describe("locales", () => {
  it("exposes 40 common locales", () => {
    expect(COMMON_LOCALES).toHaveLength(40);
    expect(COMMON_LOCALES).toContain("en-US");
    expect(COMMON_LOCALES).toContain("zh-TW");
  });

  it("canonicalizes BCP-47 tags", () => {
    expect(canonicalizeLocale("en-us")).toBe("en-US");
    expect(canonicalizeLocale("zh-hant-tw")).toBe("zh-Hant-TW");
    expect(canonicalizeLocale("")).toBeNull();
    expect(canonicalizeLocale("not-a-locale!!!")).toBeNull();
  });

  it("dedupes and sorts target locales by canonical form", () => {
    expect(normalizeTargetLocales(["fr-fr", "de-DE", "fr-FR"])).toEqual(["fr-FR", "de-DE"]);
  });

  it("rejects source locale in targets", () => {
    expect(
      normalizeProjectLocales({
        sourceLocale: "en-US",
        targetLocales: ["fr-FR", "en-us"],
      }),
    ).toEqual({ error: "source_in_targets" });
  });

  it("normalizes valid project locale pairs", () => {
    expect(
      normalizeProjectLocales({
        sourceLocale: "en",
        targetLocales: ["fr-FR", "de-DE"],
      }),
    ).toEqual({
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
    });
  });

  it("builds human-readable labels", () => {
    expect(getLocaleLabel("fr-FR")).toContain("French");
  });

  it("detects rtl locales", () => {
    expect(isRtlLocale("ar-SA")).toBe(true);
    expect(isRtlLocale("en-US")).toBe(false);
  });
});
