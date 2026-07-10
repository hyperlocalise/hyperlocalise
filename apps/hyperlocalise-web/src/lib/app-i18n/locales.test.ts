import { NextRequest } from "next/server";
import { describe, expect, it } from "vite-plus/test";

import {
  APP_LOCALE_COOKIE_NAME,
  AVAILABLE_APP_CONTENT_LOCALES,
  DEFAULT_APP_LOCALE,
  getAppLocaleFromRequest,
  isAvailableAppContentLocale,
  isSupportedAppLocale,
  normalizeAppContentLocale,
  normalizeAppLocale,
  SUPPORTED_APP_LOCALES,
} from "./locales";

function createRequest(input: { cookieLocale?: string; acceptLanguage?: string } = {}) {
  const headers = new Headers();
  if (input.acceptLanguage) {
    headers.set("accept-language", input.acceptLanguage);
  }
  if (input.cookieLocale) {
    headers.set("cookie", `${APP_LOCALE_COOKIE_NAME}=${input.cookieLocale}`);
  }

  return new NextRequest("https://www.hyperlocalise.com/", { headers });
}

describe("app i18n locales", () => {
  it("supports English first", () => {
    expect(SUPPORTED_APP_LOCALES[0]).toBe("en");
    expect(DEFAULT_APP_LOCALE).toBe("en");
    expect(isSupportedAppLocale("en")).toBe(true);
  });

  it("supports every ready content locale for routing", () => {
    expect(SUPPORTED_APP_LOCALES).toEqual(AVAILABLE_APP_CONTENT_LOCALES);
    expect(SUPPORTED_APP_LOCALES).toEqual(["en", "zh-CN", "vi-VN", "de-DE", "fr-FR"]);
    expect(isSupportedAppLocale("zh-CN")).toBe(true);
    expect(isSupportedAppLocale("fr-FR")).toBe(true);
    expect(isSupportedAppLocale("ja-JP")).toBe(false);
  });

  it("normalizes supported locales case-insensitively", () => {
    expect(normalizeAppLocale("EN")).toBe("en");
    expect(normalizeAppLocale("zh-cn")).toBe("zh-CN");
    expect(normalizeAppLocale("fr")).toBeNull();
  });

  it("keeps content locale helpers aligned with supported routing locales", () => {
    expect(AVAILABLE_APP_CONTENT_LOCALES).toEqual(["en", "zh-CN", "vi-VN", "de-DE", "fr-FR"]);
    expect(isAvailableAppContentLocale("zh-CN")).toBe(true);
    expect(isAvailableAppContentLocale("fr-FR")).toBe(true);
    expect(normalizeAppContentLocale("zh-cn")).toBe("zh-CN");
    expect(normalizeAppContentLocale("de-de")).toBe("de-DE");
    expect(normalizeAppContentLocale("ja-JP")).toBeNull();
  });

  it("prefers the locale cookie before accept-language negotiation", () => {
    expect(
      getAppLocaleFromRequest(
        createRequest({
          cookieLocale: "en",
          acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.5",
        }),
      ),
    ).toBe("en");
  });

  it("negotiates supported accept-language values", () => {
    expect(getAppLocaleFromRequest(createRequest({ acceptLanguage: "fr-FR,fr;q=0.9" }))).toBe(
      "fr-FR",
    );
    expect(getAppLocaleFromRequest(createRequest({ acceptLanguage: "zh-CN,zh;q=0.8" }))).toBe(
      "zh-CN",
    );
  });

  it("falls back to English for unsupported accept-language values", () => {
    expect(getAppLocaleFromRequest(createRequest({ acceptLanguage: "ja-JP,ja;q=0.9" }))).toBe("en");
  });
});
