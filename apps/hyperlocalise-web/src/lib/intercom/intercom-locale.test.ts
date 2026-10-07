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

import { mapProjectLocalesToIntercom, resolveIntercomLocaleKey } from "./intercom-locale";

describe("resolveIntercomLocaleKey", () => {
  it("matches exact locale tags only", () => {
    expect(resolveIntercomLocaleKey("en-US", ["en", "de"])).toBeNull();
    expect(resolveIntercomLocaleKey("en-US", ["en-US", "de"])).toBe("en-US");
  });
});

describe("mapProjectLocalesToIntercom", () => {
  it("maps project targets to intercom locales without language fallback", () => {
    const result = mapProjectLocalesToIntercom({
      projectSourceLocale: "en",
      projectTargetLocales: ["de-DE", "fr-FR"],
      intercomLocales: ["en", "de", "fr"],
      configuredSourceLocale: "en",
    });

    expect(result.sourceIntercomLocale).toBe("en");
    expect(result.unmappedProjectTargets).toEqual(["de-DE", "fr-FR"]);
    expect(result.jobTargetLocales).toEqual([]);
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

  it("rejects a configured source locale that does not match the project source", () => {
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
