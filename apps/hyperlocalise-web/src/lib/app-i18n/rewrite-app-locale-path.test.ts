import { describe, expect, it } from "vite-plus/test";

import {
  getAppLocaleFlagEmoji,
  getAppLocaleFromPathname,
  getNativeLocaleDisplayName,
  rewriteAppLocalePath,
} from "./rewrite-app-locale-path";

describe("rewriteAppLocalePath", () => {
  it("swaps an existing locale prefix", () => {
    expect(rewriteAppLocalePath("/en/org/acme/inbox", "fr-FR")).toBe("/fr-FR/org/acme/inbox");
    expect(rewriteAppLocalePath("/zh-CN/blog", "vi-VN")).toBe("/vi-VN/blog");
  });

  it("prefixes paths that lack a locale segment", () => {
    expect(rewriteAppLocalePath("/org/acme/inbox", "de-DE")).toBe("/de-DE/org/acme/inbox");
    expect(rewriteAppLocalePath("/", "zh-CN")).toBe("/zh-CN");
  });

  it("preserves query and hash", () => {
    expect(rewriteAppLocalePath("/en/blog?page=2#comments", "fr-FR")).toBe(
      "/fr-FR/blog?page=2#comments",
    );
  });

  it("normalizes locale-only paths", () => {
    expect(rewriteAppLocalePath("/en", "de-DE")).toBe("/de-DE");
    expect(rewriteAppLocalePath("/en/", "vi-VN")).toBe("/vi-VN");
  });

  it("returns the same path shape when the locale is unchanged", () => {
    expect(rewriteAppLocalePath("/fr-FR/product/agents-automation", "fr-FR")).toBe(
      "/fr-FR/product/agents-automation",
    );
  });
});

describe("getAppLocaleFromPathname", () => {
  it("reads a supported locale prefix", () => {
    expect(getAppLocaleFromPathname("/zh-CN/blog")).toBe("zh-CN");
    expect(getAppLocaleFromPathname("/EN/org/acme")).toBe("en");
  });

  it("falls back to the default locale when missing or unsupported", () => {
    expect(getAppLocaleFromPathname("/org/acme")).toBe("en");
    expect(getAppLocaleFromPathname("/ja/blog")).toBe("en");
    expect(getAppLocaleFromPathname("/")).toBe("en");
  });
});

describe("getNativeLocaleDisplayName", () => {
  it("returns a native language label", () => {
    expect(getNativeLocaleDisplayName("en")).toMatch(/english/i);
    expect(getNativeLocaleDisplayName("de-DE")).toMatch(/deutsch/i);
    expect(getNativeLocaleDisplayName("zh-CN")).toMatch(/中文|chinese/i);
  });
});

describe("getAppLocaleFlagEmoji", () => {
  it("returns a country flag for each supported locale", () => {
    expect(getAppLocaleFlagEmoji("en")).toBe("🇺🇸");
    expect(getAppLocaleFlagEmoji("zh-CN")).toBe("🇨🇳");
    expect(getAppLocaleFlagEmoji("vi-VN")).toBe("🇻🇳");
    expect(getAppLocaleFlagEmoji("de-DE")).toBe("🇩🇪");
    expect(getAppLocaleFlagEmoji("fr-FR")).toBe("🇫🇷");
  });
});
