import { describe, expect, it } from "vite-plus/test";

import { getIntlShape } from "./intl";

describe("getIntlShape", () => {
  it("returns empty messages for the source locale", () => {
    expect(getIntlShape("en").messages).toEqual({});
  });

  it("loads translated catalogs for every content locale", () => {
    for (const locale of ["zh-CN", "vi-VN", "de-DE", "fr-FR"] as const) {
      const messages = getIntlShape(locale).messages;
      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(getIntlShape(locale).locale).toBe(locale);
    }
  });

  it("falls back to the default locale for unknown locales", () => {
    expect(getIntlShape("ja-JP").locale).toBe("en");
    expect(getIntlShape("ja-JP").messages).toEqual({});
  });
});
