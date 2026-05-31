import { describe, expect, it } from "vite-plus/test";

import {
  canonicalizeLocale,
  COMMON_LOCALES,
  getLocaleLabel,
  isRtlLocale,
  normalizeProjectLocalePatch,
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

  it("dedupes target locales by canonical form while preserving insertion order", () => {
    expect(normalizeTargetLocales(["fr-fr", "de-DE", "fr-FR"])).toEqual(["fr-FR", "de-DE"]);
  });

  it("allows partial locale patch when the other side is unset on legacy projects", () => {
    expect(
      normalizeProjectLocalePatch({
        existingSourceLocale: null,
        existingTargetLocales: [],
        targetLocales: ["fr-FR"],
      }),
    ).toEqual({ targetLocales: ["fr-FR"] });

    expect(
      normalizeProjectLocalePatch({
        existingSourceLocale: null,
        existingTargetLocales: [],
        sourceLocale: "en-US",
      }),
    ).toEqual({ sourceLocale: "en-US" });
  });

  it("runs cross-field checks when both sides are configured after merge", () => {
    expect(
      normalizeProjectLocalePatch({
        existingSourceLocale: "en-US",
        existingTargetLocales: [],
        targetLocales: ["en-us"],
      }),
    ).toEqual({ error: "source_in_targets" });
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
