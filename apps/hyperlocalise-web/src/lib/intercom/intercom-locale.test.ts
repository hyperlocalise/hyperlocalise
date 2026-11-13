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
  intercomCopyHasVisibleText,
  intercomLocalesShareLanguage,
  isIntercomTargetContentImportable,
  mapProjectLocalesToIntercom,
  resolveIntercomLocaleKey,
  resolveProjectLocaleKey,
  selectIntercomTargetLocalesToImport,
  unionIntercomLocales,
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

describe("unionIntercomLocales", () => {
  it("adds article translated_content keys that the Help Center list omitted", () => {
    expect(unionIntercomLocales(["en", "fr"], ["fr", "de"])).toEqual(["en", "fr", "de"]);
  });
});

describe("isIntercomTargetContentImportable", () => {
  it("accepts title and body with real copy", () => {
    expect(
      isIntercomTargetContentImportable({
        title: "Bonjour",
        description: "",
        body: "<p>Bienvenue</p>",
      }),
    ).toBe(true);
    expect(intercomCopyHasVisibleText("<p>Bienvenue</p>")).toBe(true);
  });

  it("rejects title-only copy and empty HTML bodies", () => {
    expect(
      isIntercomTargetContentImportable({
        title: "Hallo",
        description: "",
        body: "",
      }),
    ).toBe(false);
    expect(
      isIntercomTargetContentImportable({
        title: "Hallo",
        description: "",
        body: "<p></p>",
      }),
    ).toBe(false);
    expect(
      isIntercomTargetContentImportable({
        title: "Hallo",
        description: "",
        body: "<p>&nbsp;</p>",
      }),
    ).toBe(false);
    expect(intercomCopyHasVisibleText("<p></p>")).toBe(false);
  });
});

describe("mapProjectLocalesToIntercom", () => {
  it("maps German from an article locale when the Help Center list omitted it", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en-US",
      projectTargetLocales: ["de-DE", "fr-FR"],
      intercomLocales: unionIntercomLocales(["en", "fr"], ["fr", "de"]),
      configuredSourceLocale: "en",
    });

    expect(result.sourceIntercomLocale).toBe("en");
    expect(result.jobTargetLocales).toEqual(["de-DE", "fr-FR"]);
    expect(result.intercomTargetLocales).toEqual(["de", "fr"]);
  });

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

describe("selectIntercomTargetLocalesToImport", () => {
  const localeMapping = {
    sourceIntercomLocale: "en",
    jobTargetLocales: ["de-DE", "fr-FR", "ja-JP"],
    intercomTargetLocales: ["de", "fr", "ja"],
  };

  it("imports mapped locales that have a title and body", () => {
    expect(
      selectIntercomTargetLocalesToImport({
        localeMapping,
        localeContent: {
          de: { title: "Hallo", description: "", body: "Willkommen" },
          fr: { title: "Bonjour", description: "Intro", body: "Bienvenue" },
        },
      }),
    ).toEqual([
      {
        projectLocale: "de-DE",
        intercomLocale: "de",
        fields: { title: "Hallo", description: "", body: "Willkommen" },
      },
      {
        projectLocale: "fr-FR",
        intercomLocale: "fr",
        fields: { title: "Bonjour", description: "Intro", body: "Bienvenue" },
      },
    ]);
  });

  it("looks up translated_content by normalized Intercom locale tags", () => {
    expect(
      selectIntercomTargetLocalesToImport({
        localeMapping: {
          sourceIntercomLocale: "en",
          jobTargetLocales: ["en-GB"],
          intercomTargetLocales: ["en-GB"],
        },
        localeContent: {
          "en-gb": { title: "Hello", description: "", body: "Welcome" },
        },
      }),
    ).toEqual([
      {
        projectLocale: "en-GB",
        intercomLocale: "en-GB",
        fields: { title: "Hello", description: "", body: "Welcome" },
      },
    ]);
  });

  it("skips the source locale, unmapped locales, and incomplete copy", () => {
    expect(
      selectIntercomTargetLocalesToImport({
        localeMapping: {
          sourceIntercomLocale: "en",
          jobTargetLocales: ["de-DE", "fr-FR"],
          intercomTargetLocales: ["en", "fr"],
        },
        localeContent: {
          en: { title: "Hello", description: "", body: "Source" },
          ja: { title: "こんにちは", description: "", body: "本文" },
          fr: { title: "Bonjour", description: "", body: "" },
        },
      }),
    ).toEqual([]);
  });

  it("does not import a German stub with a title and empty HTML body", () => {
    expect(
      selectIntercomTargetLocalesToImport({
        localeMapping,
        localeContent: {
          de: { title: "Getting started", description: "", body: "<p>&nbsp;</p>" },
          fr: { title: "Bonjour", description: "Intro", body: "Bienvenue" },
        },
      }),
    ).toEqual([
      {
        projectLocale: "fr-FR",
        intercomLocale: "fr",
        fields: { title: "Bonjour", description: "Intro", body: "Bienvenue" },
      },
    ]);
  });
});
