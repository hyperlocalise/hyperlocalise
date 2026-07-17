import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_APP_LOCALE, SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";

import {
  getLocalizedAbsoluteUrl,
  getLocalizedAlternates,
  getSitemapLanguageAlternates,
} from "./localized-alternates";
import { SITE_URL } from "./site-url";

describe("getLocalizedAbsoluteUrl", () => {
  it("builds home and nested paths with the locale prefix", () => {
    expect(getLocalizedAbsoluteUrl("en")).toBe(`${SITE_URL}/en`);
    expect(getLocalizedAbsoluteUrl("zh-CN", "/")).toBe(`${SITE_URL}/zh-CN`);
    expect(getLocalizedAbsoluteUrl("fr-FR", "/blog")).toBe(`${SITE_URL}/fr-FR/blog`);
    expect(getLocalizedAbsoluteUrl("de-DE", "/blog/hello-world")).toBe(
      `${SITE_URL}/de-DE/blog/hello-world`,
    );
  });

  it("normalizes missing leading slash and trailing slash", () => {
    expect(getLocalizedAbsoluteUrl("en", "terms")).toBe(`${SITE_URL}/en/terms`);
    expect(getLocalizedAbsoluteUrl("en", "/terms/")).toBe(`${SITE_URL}/en/terms`);
  });
});

describe("getLocalizedAlternates", () => {
  it("sets canonical for the current locale and hreflang for every supported locale", () => {
    const alternates = getLocalizedAlternates({ locale: "vi-VN", path: "/product/agents" });

    expect(alternates.canonical).toBe(`${SITE_URL}/vi-VN/product/agents`);
    expect(alternates.languages).toEqual({
      en: `${SITE_URL}/en/product/agents`,
      "zh-CN": `${SITE_URL}/zh-CN/product/agents`,
      "vi-VN": `${SITE_URL}/vi-VN/product/agents`,
      "de-DE": `${SITE_URL}/de-DE/product/agents`,
      "fr-FR": `${SITE_URL}/fr-FR/product/agents`,
      "x-default": `${SITE_URL}/en/product/agents`,
    });
    expect(Object.keys(alternates.languages ?? {}).filter((key) => key !== "x-default")).toEqual(
      expect.arrayContaining([...SUPPORTED_APP_LOCALES]),
    );
  });

  it("limits hreflang to the locales that actually have the page", () => {
    const alternates = getLocalizedAlternates({
      locale: "en",
      path: "/blog/partial-post",
      locales: ["en", "de-DE"],
    });

    expect(alternates.languages).toEqual({
      en: `${SITE_URL}/en/blog/partial-post`,
      "de-DE": `${SITE_URL}/de-DE/blog/partial-post`,
      "x-default": `${SITE_URL}/en/blog/partial-post`,
    });
  });

  it("omits x-default when the default locale is not among available locales", () => {
    const alternates = getLocalizedAlternates({
      locale: "fr-FR",
      path: "/blog/fr-only",
      locales: ["fr-FR", "de-DE"],
    });

    expect(alternates.languages).toEqual({
      "fr-FR": `${SITE_URL}/fr-FR/blog/fr-only`,
      "de-DE": `${SITE_URL}/de-DE/blog/fr-only`,
    });
    expect(alternates.languages).not.toHaveProperty("x-default");
    expect(DEFAULT_APP_LOCALE).toBe("en");
  });
});

describe("getSitemapLanguageAlternates", () => {
  it("returns the same language map used for metadata hreflang", () => {
    expect(getSitemapLanguageAlternates("/trust-center")).toEqual(
      getLocalizedAlternates({ locale: "en", path: "/trust-center" }).languages,
    );
  });
});
