import { describe, expect, it } from "vite-plus/test";

import { pickTranslationsForLocale, projectLocalesMatch } from "./locale-map";

describe("projectLocalesMatch", () => {
  it("matches canonical project tags case-insensitively", () => {
    expect(projectLocalesMatch("en-US", "en-us")).toBe(true);
  });

  it("does not match language-only tags to regional locales", () => {
    expect(projectLocalesMatch("vi", "vi-VN")).toBe(false);
    expect(projectLocalesMatch("en", "en-US")).toBe(false);
  });
});

describe("pickTranslationsForLocale", () => {
  it("requires the exact project locale key", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi-vn")).toEqual({ "figma.k.a": "Xin chào" });
    expect(pickTranslationsForLocale(map, "vi")).toBeUndefined();
  });
});
