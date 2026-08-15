/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  canonicalPathLocale,
  formatBcp47Locale,
  htmlLangMatchesPathLocale,
  htmlLangSuggestionForPathLocale,
  isCjkLanguage,
  isRtlLanguage,
  isWellFormedHtmlLang,
  pageLocale,
  pathLocaleFromUrl,
  textHasEasternArabicDigits,
  textHasGregorianCalendarSignals,
  textHasHijriCalendarSignals,
} from "./shared";
import { emptyCrawledPage } from "../types";

describe("htmlLangSuggestionForPathLocale", () => {
  it("maps region-only path prefixes to BCP 47 tags instead of invalid language codes", () => {
    expect(htmlLangSuggestionForPathLocale("au")).toBe("en-AU");
    expect(htmlLangSuggestionForPathLocale("jp")).toBe("ja-JP");
    expect(htmlLangSuggestionForPathLocale("kr")).toBe("ko-KR");
    expect(htmlLangSuggestionForPathLocale("cn")).toBe("zh-CN");
    expect(htmlLangSuggestionForPathLocale("mx")).toBe("es-MX");
  });

  it("formats language-region path tokens and leaves bare languages unchanged", () => {
    expect(htmlLangSuggestionForPathLocale("en_AU")).toBe("en-AU");
    expect(htmlLangSuggestionForPathLocale("FR")).toBe("fr");
    expect(htmlLangSuggestionForPathLocale("pt-br")).toBe("pt-BR");
    expect(htmlLangSuggestionForPathLocale("es-419")).toBe("es-419");
  });
});

describe("htmlLangMatchesPathLocale", () => {
  it("treats bare language html lang as compatible with the matching region path", () => {
    expect(htmlLangMatchesPathLocale("en", "au")).toBe(true);
    expect(htmlLangMatchesPathLocale("ja", "jp")).toBe(true);
  });

  it("rejects wrong-language and wrong-region declarations for region paths", () => {
    expect(htmlLangMatchesPathLocale("fr", "au")).toBe(false);
    expect(htmlLangMatchesPathLocale("en-GB", "au")).toBe(false);
    expect(htmlLangMatchesPathLocale("en-AU", "au")).toBe(true);
  });

  it("accepts language-region html lang when the path is a bare language", () => {
    expect(htmlLangMatchesPathLocale("en-AU", "en")).toBe(true);
    expect(htmlLangMatchesPathLocale("fr-CA", "fr")).toBe(true);
    expect(htmlLangMatchesPathLocale("es-419", "es")).toBe(true);
    expect(htmlLangMatchesPathLocale("en-AU", "fr")).toBe(false);
  });
});

describe("canonicalPathLocale and pageLocale", () => {
  it("canonicalizes region path prefixes for locale signals", () => {
    expect(canonicalPathLocale("au")).toBe("en-au");
    expect(canonicalPathLocale("JP")).toBe("ja-jp");
    expect(formatBcp47Locale("en_au")).toBe("en-AU");
    expect(formatBcp47Locale("es-419")).toBe("es-419");
  });

  it("prefers canonical path locale over html lang when both are present", () => {
    expect(
      pageLocale(
        emptyCrawledPage({
          url: "https://example.com/au/pricing",
          htmlLang: "fr",
        }),
      ),
    ).toBe("en-au");
  });
});

describe("isWellFormedHtmlLang", () => {
  it("accepts UN M.49 regions and other well-formed BCP 47 tags", () => {
    expect(isWellFormedHtmlLang("es-419")).toBe(true);
    expect(isWellFormedHtmlLang("zh-Hans")).toBe(true);
    expect(isWellFormedHtmlLang("en-US")).toBe(true);
    expect(isWellFormedHtmlLang("fr")).toBe(true);
  });

  it("rejects tags that are not well-formed BCP 47", () => {
    expect(isWellFormedHtmlLang("english")).toBe(false);
    expect(isWellFormedHtmlLang("espanol")).toBe(false);
    expect(isWellFormedHtmlLang("en-U")).toBe(false);
    expect(isWellFormedHtmlLang("x-default")).toBe(false);
    expect(isWellFormedHtmlLang("")).toBe(false);
  });
});

describe("pathLocaleFromUrl", () => {
  it("reads UN M.49 locale prefixes from the path", () => {
    expect(pathLocaleFromUrl("https://www.dropbox.com/es-419/")).toBe("es-419");
    expect(pathLocaleFromUrl("https://www.dropbox.com/es/")).toBe("es");
    expect(pathLocaleFromUrl("https://www.dropbox.com/de/")).toBe("de");
  });
});

describe("script and calendar helpers", () => {
  it("classifies RTL and CJK languages from language or language-region tags", () => {
    expect(isRtlLanguage("ar-SA")).toBe(true);
    expect(isRtlLanguage("he")).toBe(true);
    expect(isRtlLanguage("en")).toBe(false);
    expect(isCjkLanguage("zh-CN")).toBe(true);
    expect(isCjkLanguage("ja-JP")).toBe(true);
    expect(isCjkLanguage("ko")).toBe(true);
    expect(isCjkLanguage("vi")).toBe(false);
  });

  it("detects Eastern Arabic digits and Hijri vs Gregorian calendar signals", () => {
    expect(textHasEasternArabicDigits("السعر ١٢٣")).toBe(true);
    expect(textHasEasternArabicDigits("price 123")).toBe(false);
    expect(textHasHijriCalendarSignals("1 رمضان 1446")).toBe(true);
    expect(textHasHijriCalendarSignals("Ramadan 1446")).toBe(true);
    expect(textHasGregorianCalendarSignals("15 يناير 2024")).toBe(true);
    expect(textHasGregorianCalendarSignals("January 2024")).toBe(true);
    expect(textHasGregorianCalendarSignals("1 رمضان 1446")).toBe(false);
  });
});
