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
  intercomLocalesShareLanguage,
  mapProjectLocalesToIntercom,
  resolveIntercomLocaleKey,
  resolveProjectLocaleKey,
} from "./intercom-locale";

describe("resolveIntercomLocaleKey", () => {
  it("prefers an exact locale tag", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en", "en-US", "de"])).toBe("en-US");
  });

  it("maps a regional project locale onto a language-only Intercom locale", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en", "de"])).toBe("en");
    expect(resolveIntercomLocaleKey("de-DE", ["en", "de", "fr"])).toBe("de");
    expect(resolveIntercomLocaleKey("es-ES", ["en", "es"])).toBe("es");
    expect(resolveIntercomLocaleKey("es-MX", ["en", "es"])).toBe("es");
  });

  it("maps a language-only project locale onto a single Intercom regional locale", () => {
    expect(resolveIntercomLocaleKey("en", ["en-US", "de"])).toBe("en-US");
  });

  it("does not map across regions of the same language", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en-GB", "de"])).toBeNull();
    expect(resolveIntercomLocaleKey("zh-CN", ["zh-TW"])).toBeNull();
    expect(resolveIntercomLocaleKey("en", ["en-US", "en-GB"])).toBeNull();
    expect(resolveIntercomLocaleKey("pt-BR", ["pt"])).toBeNull();
    expect(resolveIntercomLocaleKey("pt-PT", ["pt-BR"])).toBeNull();
    expect(resolveIntercomLocaleKey("de-form", ["de", "de-DE"])).toBeNull();
    expect(resolveIntercomLocaleKey("de-DE", ["de-form"])).toBeNull();
  });
});

describe("resolveProjectLocaleKey", () => {
  it("maps Intercom es onto project es-ES", () => {
    expect(resolveProjectLocaleKey("es", ["es-ES", "de-DE"])).toBe("es-ES");
    expect(resolveProjectLocaleKey("es-ES", ["es-ES", "de-DE"])).toBe("es-ES");
  });

  it("maps Intercom es onto the only Spanish project locale", () => {
    expect(resolveProjectLocaleKey("es", ["es-MX"])).toBe("es-MX");
  });

  it("prefers documented es-ES when multiple Spanish project locales exist", () => {
    expect(resolveProjectLocaleKey("es", ["es-MX", "es-ES"])).toBe("es-ES");
  });

  it("does not pick a Spanish locale when two non-preferred regionals compete", () => {
    expect(resolveProjectLocaleKey("es", ["es-MX", "es-AR"])).toBeNull();
  });

  it("does not map across locked Intercom regionals", () => {
    expect(resolveProjectLocaleKey("pt-BR", ["pt-PT"])).toBeNull();
    expect(resolveProjectLocaleKey("zh-CN", ["zh-TW"])).toBeNull();
    expect(resolveProjectLocaleKey("de-form", ["de-DE"])).toBeNull();
  });
});

describe("intercomLocalesShareLanguage", () => {
  it("treats en and en-US as the same language", () => {
    expect(intercomLocalesShareLanguage("en", "en-US")).toBe(true);
    expect(intercomLocalesShareLanguage("de", "en-US")).toBe(false);
  });

  it("does not treat formal German as the same language as de-DE", () => {
    expect(intercomLocalesShareLanguage("de-form", "de-DE")).toBe(false);
    expect(intercomLocalesShareLanguage("de-form", "de")).toBe(false);
  });
});

describe("mapProjectLocalesToIntercom", () => {
  it("maps regional project targets onto Intercom language codes", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en-US",
      projectTargetLocales: ["de-DE", "fr-FR"],
      intercomLocales: ["en", "de", "fr"],
      configuredSourceLocale: "en",
    });

    expect(result.sourceIntercomLocale).toBe("en");
    expect(result.jobTargetLocales).toEqual(["de-DE", "fr-FR"]);
    expect(result.intercomTargetLocales).toEqual(["de", "fr"]);
    expect(result.unmappedProjectTargets).toEqual([]);
  });

  it("maps Intercom es onto project es-ES", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en-US",
      projectTargetLocales: ["es-ES", "de-DE"],
      intercomLocales: ["en", "es", "de"],
    });

    expect(result.sourceIntercomLocale).toBe("en");
    expect(result.jobTargetLocales).toEqual(["es-ES", "de-DE"]);
    expect(result.intercomTargetLocales).toEqual(["es", "de"]);
    expect(result.unmappedProjectTargets).toEqual([]);
  });

  it("maps a configured Intercom target key back onto the project locale", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en-US",
      projectTargetLocales: ["es-ES", "de-DE"],
      intercomLocales: ["en", "es", "de"],
      configuredSourceLocale: "en",
      configuredTargetLocales: ["es"],
    });

    expect(result.sourceIntercomLocale).toBe("en");
    expect(result.jobTargetLocales).toEqual(["es-ES"]);
    expect(result.intercomTargetLocales).toEqual(["es"]);
    expect(result.unmappedProjectTargets).toEqual([]);
  });

  it("keeps job and Intercom target arrays aligned when two project locales share a key", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en",
      projectTargetLocales: ["es-ES", "es-MX"],
      intercomLocales: ["en", "es"],
    });

    expect(result.jobTargetLocales).toEqual(["es-ES"]);
    expect(result.intercomTargetLocales).toEqual(["es"]);
    expect(result.jobTargetLocales).toHaveLength(result.intercomTargetLocales.length);
  });

  it("maps when tags align exactly", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en",
      projectTargetLocales: ["de", "fr"],
      intercomLocales: ["en", "de", "fr"],
    });

    expect(result.sourceIntercomLocale).toBe("en");
    expect(result.jobTargetLocales).toEqual(["de", "fr"]);
    expect(result.intercomTargetLocales).toEqual(["de", "fr"]);
    expect(result.unmappedProjectTargets).toEqual([]);
  });

  it("keeps pt-BR exact and does not map it onto pt", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en",
      projectTargetLocales: ["pt-BR", "pt-PT"],
      intercomLocales: ["en", "pt", "pt-BR"],
    });

    expect(result.jobTargetLocales).toEqual(["pt-BR", "pt-PT"]);
    expect(result.intercomTargetLocales).toEqual(["pt-BR", "pt"]);
  });

  it("rejects a configured source locale in a different language", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en",
      projectTargetLocales: ["de"],
      intercomLocales: ["en", "de"],
      configuredSourceLocale: "de",
    });

    expect(result.sourceIntercomLocale).toBeNull();
    expect(result.jobTargetLocales).toEqual([]);
  });

  it("rejects a configured source locale with a locked writing form", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "zh-CN",
      projectTargetLocales: ["en"],
      intercomLocales: ["zh-TW", "en"],
      configuredSourceLocale: "zh-TW",
    });

    expect(result.sourceIntercomLocale).toBeNull();
    expect(result.jobTargetLocales).toEqual([]);
  });
});
