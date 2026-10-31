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
  areIterableSourceLocalesCompatible,
  mapProjectLocalesToIterable,
  mapProjectLocalesToIterableLocaleIds,
  normalizeIterableLocaleTag,
  resolveIterableLocaleId,
} from "./locale";

describe("normalizeIterableLocaleTag", () => {
  it("normalizes underscores to hyphens", () => {
    expect(normalizeIterableLocaleTag("pt_BR")).toBe("pt-BR");
  });
});

describe("areIterableSourceLocalesCompatible", () => {
  it("accepts same-language pairs and rejects locked pairs", () => {
    expect(areIterableSourceLocalesCompatible("en", "en-US")).toBe(true);
    expect(areIterableSourceLocalesCompatible("en-US", "en-GB")).toBe(false);
    expect(areIterableSourceLocalesCompatible("en", "de")).toBe(false);
  });
});

describe("resolveIterableLocaleId", () => {
  it("matches HL locales to Customer.io locales by key or name", () => {
    const locales = [
      { id: "1", name: "German", locale: "de" },
      { id: "2", name: "French", locale: "fr-FR" },
    ];
    expect(resolveIterableLocaleId("de", locales)).toBe("1");
    expect(resolveIterableLocaleId("fr-FR", locales)).toBe("2");
    expect(resolveIterableLocaleId("ja", locales)).toBeNull();
  });
});

describe("mapProjectLocalesToIterableLocaleIds", () => {
  it("splits mapped and unmapped HL locales", () => {
    const result = mapProjectLocalesToIterableLocaleIds({
      projectLocales: ["de", "ja"],
      iterableLocales: [{ id: "1", locale: "de" }],
    });
    expect(result.localeIds).toEqual({ de: "1" });
    expect(result.unmappedProjectLocales).toEqual(["ja"]);
  });
});

describe("mapProjectLocalesToIterable", () => {
  it("maps targets to suffixes and skips the source locale", () => {
    const result = mapProjectLocalesToIterable({
      projectSourceLocale: "en",
      projectTargetLocales: ["en", "de", "fr-FR"],
    });
    expect(result.jobTargetLocales).toEqual(["de", "fr-FR"]);
    expect(result.iterableSuffixes).toEqual(["de", "fr-FR"]);
  });
});
