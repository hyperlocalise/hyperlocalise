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

import { toCrowdinGlossaryLanguageId, toNativeGlossaryLocale } from "./crowdin-glossary-language";

describe("Crowdin glossary language mapping", () => {
  it.each([
    ["vi-VN", "vi"],
    ["en-US", "en"],
    ["fr-CA", "fr-CA"],
    ["fr-FR", "fr"],
    ["de-DE", "de"],
    ["pt-BR", "pt-BR"],
    ["zh-CN", "zh-CN"],
  ])("maps %s to Crowdin %s", (locale, languageId) => {
    expect(toCrowdinGlossaryLanguageId(locale)).toBe(languageId);
  });

  it("resolves Crowdin language IDs case-insensitively", () => {
    expect(toCrowdinGlossaryLanguageId("EN")).toBe("en");
    expect(toCrowdinGlossaryLanguageId("Vi")).toBe("vi");
    expect(toCrowdinGlossaryLanguageId("FR-CA")).toBe("fr-CA");
  });

  it("preserves a native locale when it already identifies the Crowdin language", () => {
    expect(toNativeGlossaryLocale("vi", ["vi-VN"])).toBe("vi-VN");
    expect(toNativeGlossaryLocale("de", ["de"])).toBe("de");
  });

  it("prefers project locales so fr-CA is not defaulted to fr-FR", () => {
    expect(toNativeGlossaryLocale("fr-CA", ["en-US", "fr-CA"])).toBe("fr-CA");
    expect(toNativeGlossaryLocale("fr", ["en-US", "fr-FR"])).toBe("fr-FR");
    expect(toNativeGlossaryLocale("fr", ["en-US", "fr-CA", "fr-FR"])).toBe("fr-FR");
  });

  it("matches preferred locales against case-insensitive Crowdin IDs", () => {
    expect(toNativeGlossaryLocale("EN", ["en-US", "vi-VN"])).toBe("en-US");
    expect(toNativeGlossaryLocale("Vi", ["en-US", "vi-VN"])).toBe("vi-VN");
  });

  it("maps Crowdin language IDs to canonical native locales", () => {
    expect(toNativeGlossaryLocale("vi")).toBe("vi-VN");
    expect(toNativeGlossaryLocale("pt-BR")).toBe("pt-BR");
    expect(toNativeGlossaryLocale("fr")).toBe("fr-FR");
  });

  it("rejects unsupported locales", () => {
    expect(() => toCrowdinGlossaryLanguageId("xx-XX")).toThrow(
      "unsupported_crowdin_language:xx-XX",
    );
  });
});
