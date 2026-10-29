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

import type { WebflowLocale } from "./types";
import {
  areWebflowSourceLocalesCompatible,
  mapProjectLocalesToWebflow,
  normalizeWebflowLocaleTag,
  resolveWebflowLocaleKey,
} from "./webflow-locale";

const primary: WebflowLocale = {
  id: "primary",
  cmsLocaleId: "cms-en",
  tag: "en",
  enabled: true,
};

const french: WebflowLocale = {
  id: "fr",
  cmsLocaleId: "cms-fr",
  tag: "fr",
  enabled: true,
};

const germanDisabled: WebflowLocale = {
  id: "de",
  cmsLocaleId: "cms-de",
  tag: "de",
  enabled: false,
};

const americanEnglish: WebflowLocale = {
  id: "en-us",
  cmsLocaleId: "cms-en-us",
  tag: "en-US",
  enabled: true,
};

const britishEnglish: WebflowLocale = {
  id: "en-gb",
  cmsLocaleId: "cms-en-gb",
  tag: "en-GB",
  enabled: true,
};

const genericEnglish: WebflowLocale = {
  id: "en-generic",
  cmsLocaleId: "cms-en-generic",
  tag: "en",
  enabled: true,
};

describe("normalizeWebflowLocaleTag", () => {
  it("canonicalizes regional tags", () => {
    expect(normalizeWebflowLocaleTag("en-US")).toBe(normalizeWebflowLocaleTag("en-us"));
  });

  it("compares source locales after normalization", () => {
    expect(areWebflowSourceLocalesCompatible("en-US", "en-US")).toBe(true);
    expect(areWebflowSourceLocalesCompatible("en", "en-US")).toBe(true);
    expect(areWebflowSourceLocalesCompatible("en-GB", "en-US")).toBe(true);
    expect(areWebflowSourceLocalesCompatible("en", "fr")).toBe(false);
  });
});

describe("resolveWebflowLocaleKey", () => {
  it("matches exact tags first", () => {
    expect(resolveWebflowLocaleKey("fr", [primary, french])?.cmsLocaleId).toBe("cms-fr");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWebflowLocaleKey("ja", [primary, french])).toBeNull();
  });

  it("prefers a language-only entry over regional ones", () => {
    expect(resolveWebflowLocaleKey("en-US", [britishEnglish, genericEnglish])?.cmsLocaleId).toBe(
      "cms-en-generic",
    );
  });

  it("maps a language-only project locale onto the sole regional entry", () => {
    expect(resolveWebflowLocaleKey("en", [americanEnglish])?.cmsLocaleId).toBe("cms-en-us");
  });

  it("leaves ambiguous regional entries unmapped instead of guessing", () => {
    expect(resolveWebflowLocaleKey("en", [americanEnglish, britishEnglish])).toBeNull();
  });
});

describe("mapProjectLocalesToWebflow", () => {
  it("maps the primary source and enabled secondaries", () => {
    const mapping = mapProjectLocalesToWebflow({
      projectSourceLocale: "en",
      projectTargetLocales: ["fr"],
      webflowLocales: { primary, secondary: [french, germanDisabled] },
    });

    expect(mapping.sourceCmsLocaleId).toBe("cms-en");
    expect(mapping.unmappedProjectTargets).toEqual([]);
    expect(mapping.targets).toEqual([{ projectLocale: "fr", webflowLocale: french }]);
  });

  it("skips disabled secondaries instead of failing", () => {
    const mapping = mapProjectLocalesToWebflow({
      projectSourceLocale: "en",
      projectTargetLocales: ["de"],
      webflowLocales: { primary, secondary: [french, germanDisabled] },
    });

    expect(mapping.targets).toEqual([
      { projectLocale: "de", webflowLocale: null, skippedReason: "target_locale_disabled" },
    ]);
  });

  it("reports unmapped targets for the run summary", () => {
    const mapping = mapProjectLocalesToWebflow({
      projectSourceLocale: "en",
      projectTargetLocales: ["ja"],
      webflowLocales: { primary, secondary: [french] },
    });

    expect(mapping.unmappedProjectTargets).toEqual(["ja"]);
    expect(mapping.targets).toEqual([
      { projectLocale: "ja", webflowLocale: null, skippedReason: "target_locale_unmapped" },
    ]);
  });

  it("leaves ambiguous regional targets unmapped", () => {
    const mapping = mapProjectLocalesToWebflow({
      projectSourceLocale: "fr",
      projectTargetLocales: ["en"],
      webflowLocales: { primary: french, secondary: [americanEnglish, britishEnglish] },
    });

    expect(mapping.unmappedProjectTargets).toEqual(["en"]);
    expect(mapping.targets).toEqual([
      { projectLocale: "en", webflowLocale: null, skippedReason: "target_locale_unmapped" },
    ]);
  });

  it("leaves sourceCmsLocaleId null when the primary does not map", () => {
    const mapping = mapProjectLocalesToWebflow({
      projectSourceLocale: "ja",
      projectTargetLocales: ["fr"],
      webflowLocales: { primary, secondary: [french] },
      configuredSourceLocale: "ja",
    });

    expect(mapping.sourceCmsLocaleId).toBeNull();
  });
});
