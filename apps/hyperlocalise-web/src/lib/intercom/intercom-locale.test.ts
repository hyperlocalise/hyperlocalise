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
} from "./intercom-locale";

describe("resolveIntercomLocaleKey", () => {
  it("prefers an exact locale tag", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en", "en-US", "de"])).toBe("en-US");
  });

  it("maps a regional project locale onto a language-only Intercom locale", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en", "de"])).toBe("en");
    expect(resolveIntercomLocaleKey("de-DE", ["en", "de", "fr"])).toBe("de");
  });

  it("maps a language-only project locale onto a single Intercom regional locale", () => {
    expect(resolveIntercomLocaleKey("en", ["en-US", "de"])).toBe("en-US");
  });

  it("does not map across regions of the same language", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en-GB", "de"])).toBeNull();
    expect(resolveIntercomLocaleKey("zh-CN", ["zh-TW"])).toBeNull();
    expect(resolveIntercomLocaleKey("en", ["en-US", "en-GB"])).toBeNull();
  });
});

describe("intercomLocalesShareLanguage", () => {
  it("treats en and en-US as the same language", () => {
    expect(intercomLocalesShareLanguage("en", "en-US")).toBe(true);
    expect(intercomLocalesShareLanguage("de", "en-US")).toBe(false);
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
});
