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
  areBrazeSourceLocalesCompatible,
  isBrazeLocaleCopyName,
  mapProjectLocalesToBraze,
  resolveBrazeLocaleSuffix,
} from "./locale";

describe("braze locale", () => {
  it("maps locked regional pairs to distinct suffixes", () => {
    expect(resolveBrazeLocaleSuffix("en-US")).toBe("en-US");
    expect(resolveBrazeLocaleSuffix("en-GB")).toBe("en-GB");
    expect(resolveBrazeLocaleSuffix("pt-BR")).toBe("pt-BR");
    expect(resolveBrazeLocaleSuffix("fr-FR")).toBe("fr-FR");
    expect(resolveBrazeLocaleSuffix("fr")).toBe("fr");
  });

  it("rejects locked source locale mismatches", () => {
    expect(areBrazeSourceLocalesCompatible("en-US", "en-GB")).toBe(false);
    expect(areBrazeSourceLocalesCompatible("en", "en-US")).toBe(true);
  });

  it("maps project targets onto Braze suffixes and skips the source", () => {
    const mapped = mapProjectLocalesToBraze({
      projectSourceLocale: "en",
      projectTargetLocales: ["fr-FR", "pt-BR", "en"],
    });
    expect(mapped.jobTargetLocales).toEqual(["fr-FR", "pt-BR"]);
    expect(mapped.brazeSuffixes).toEqual(["fr-FR", "pt-BR"]);
  });

  it("detects locale-suffixed copy names", () => {
    expect(isBrazeLocaleCopyName({ name: "Welcome_fr-FR", suffixes: ["fr-FR"] })).toBe(true);
    expect(isBrazeLocaleCopyName({ name: "Welcome", suffixes: ["fr-FR"] })).toBe(false);
    expect(isBrazeLocaleCopyName({ name: "Welcome_de-DE", suffixes: ["fr-FR"] })).toBe(true);
    expect(isBrazeLocaleCopyName({ name: "Welcome_Email", suffixes: ["fr-FR"] })).toBe(false);
    expect(isBrazeLocaleCopyName({ name: "Hero_Promo", suffixes: ["fr-FR"] })).toBe(false);
  });
});
