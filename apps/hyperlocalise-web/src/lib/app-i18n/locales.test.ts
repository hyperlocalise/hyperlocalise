import { NextRequest } from "next/server";
import { describe, expect, it } from "vite-plus/test";

import {
  APP_LOCALE_COOKIE_NAME,
  DEFAULT_APP_LOCALE,
  getAppLocaleFromRequest,
  isSupportedAppLocale,
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

  it("normalizes supported locales case-insensitively", () => {
    expect(normalizeAppLocale("EN")).toBe("en");
    expect(normalizeAppLocale("fr")).toBeNull();
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

  it("falls back to English for unsupported accept-language values", () => {
    expect(getAppLocaleFromRequest(createRequest({ acceptLanguage: "fr-FR,fr;q=0.9" }))).toBe("en");
  });
});
