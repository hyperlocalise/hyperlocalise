import { describe, expect, it } from "vite-plus/test";

import { localesMatchForPick, pickTranslationsForLocale } from "./locale-map";

describe("pickTranslationsForLocale", () => {
  it("matches locale tags case-insensitively", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi-vn")).toEqual({ "figma.k.a": "Xin chào" });
  });

  it("matches by language subtag when region differs", () => {
    const map = { "vi-VN": { "figma.k.a": "Xin chào" } };
    expect(pickTranslationsForLocale(map, "vi")).toEqual({ "figma.k.a": "Xin chào" });
  });

  it("ignores empty locale maps", () => {
    const map = { "vi-VN": {}, en: { "figma.k.a": "Hello" } };
    expect(pickTranslationsForLocale(map, "vi-VN")).toBeUndefined();
    expect(pickTranslationsForLocale(map, "en")).toEqual({ "figma.k.a": "Hello" });
  });
});

describe("localesMatchForPick", () => {
  it("treats vi and vi-VN as matching", () => {
    expect(localesMatchForPick("vi", "vi-VN")).toBe(true);
  });
});
