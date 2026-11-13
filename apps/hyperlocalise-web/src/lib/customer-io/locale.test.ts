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
  areCustomerIoSourceLocalesCompatible,
  mapProjectLocalesToCustomerIo,
  mapProjectLocalesToCustomerIoLocaleIds,
  normalizeCustomerIoLocaleTag,
  resolveCustomerIoLocaleId,
} from "./locale";

describe("normalizeCustomerIoLocaleTag", () => {
  it("normalizes underscores to hyphens", () => {
    expect(normalizeCustomerIoLocaleTag("pt_BR")).toBe("pt-BR");
  });
});

describe("areCustomerIoSourceLocalesCompatible", () => {
  it("accepts same-language pairs and rejects locked pairs", () => {
    expect(areCustomerIoSourceLocalesCompatible("en", "en-US")).toBe(true);
    expect(areCustomerIoSourceLocalesCompatible("en-US", "en-GB")).toBe(false);
    expect(areCustomerIoSourceLocalesCompatible("en", "de")).toBe(false);
  });
});

describe("resolveCustomerIoLocaleId", () => {
  it("matches HL locales to Customer.io locales by key or name", () => {
    const locales = [
      { id: "1", name: "German", locale: "de" },
      { id: "2", name: "French", locale: "fr-FR" },
    ];
    expect(resolveCustomerIoLocaleId("de", locales)).toBe("1");
    expect(resolveCustomerIoLocaleId("fr-FR", locales)).toBe("2");
    expect(resolveCustomerIoLocaleId("ja", locales)).toBeNull();
  });
});

describe("mapProjectLocalesToCustomerIoLocaleIds", () => {
  it("splits mapped and unmapped HL locales", () => {
    const result = mapProjectLocalesToCustomerIoLocaleIds({
      projectLocales: ["de", "ja"],
      customerIoLocales: [{ id: "1", locale: "de" }],
    });
    expect(result.localeIds).toEqual({ de: "1" });
    expect(result.unmappedProjectLocales).toEqual(["ja"]);
  });
});

describe("mapProjectLocalesToCustomerIo", () => {
  it("maps targets to suffixes and skips the source locale", () => {
    const result = mapProjectLocalesToCustomerIo({
      projectSourceLocale: "en",
      projectTargetLocales: ["en", "de", "fr-FR"],
    });
    expect(result.jobTargetLocales).toEqual(["de", "fr-FR"]);
    expect(result.customerIoSuffixes).toEqual(["de", "fr-FR"]);
  });
});
