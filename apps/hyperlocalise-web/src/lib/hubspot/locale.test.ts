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
  assignHubspotLocales,
  hubspotCopyName,
  hubspotLanguageMatchesSource,
  isHubspotLocaleCopyName,
  mapProjectLocaleToHubspot,
} from "./locale";

describe("mapProjectLocaleToHubspot", () => {
  it("keeps regional codes HubSpot accepts and falls back to the primary language", () => {
    expect(mapProjectLocaleToHubspot("fr-FR", "email")).toBe("fr-fr");
    expect(mapProjectLocaleToHubspot("fr-FR", "form")).toBe("fr");
    expect(mapProjectLocaleToHubspot("fr-CA", "email")).toBe("fr-ca");
    expect(mapProjectLocaleToHubspot("en-GB", "email")).toBe("en-gb");
    expect(mapProjectLocaleToHubspot("en-GB", "blog")).toBe("en-gb");
    expect(mapProjectLocaleToHubspot("en-GB", "form")).toBe("en");
    expect(mapProjectLocaleToHubspot("de-DE", "form")).toBe("de");
    expect(mapProjectLocaleToHubspot("fr-FR", "message-template")).toBe("fr-fr");
    expect(mapProjectLocaleToHubspot("fr", "message-template")).toBe("fr");
  });

  it("applies HubSpot aliases when the surface does not accept the tag itself", () => {
    expect(mapProjectLocaleToHubspot("zh-Hans", "email")).toBe("zh-hans");
    expect(mapProjectLocaleToHubspot("zh-Hans", "form")).toBe("zh-cn");
    expect(mapProjectLocaleToHubspot("zh-Hant", "form")).toBe("zh-tw");
    expect(mapProjectLocaleToHubspot("nb", "form")).toBe("no-no");
    expect(mapProjectLocaleToHubspot("nb", "blog")).toBe("nb");
    expect(mapProjectLocaleToHubspot("he", "form")).toBe("he-il");
  });
});

describe("assignHubspotLocales", () => {
  it("keeps the first locale when two tags share a HubSpot code", () => {
    const assignment = assignHubspotLocales(["fr-FR", "fr"], "form");
    expect(assignment.mapped).toEqual([{ locale: "fr-FR", code: "fr" }]);
    expect(assignment.collisions).toEqual([{ locale: "fr", code: "fr", keptLocale: "fr-FR" }]);
  });

  it("keeps fr and fr-FR apart for message templates", () => {
    const assignment = assignHubspotLocales(["fr-FR", "fr"], "message-template");
    expect(assignment.mapped).toEqual([
      { locale: "fr-FR", code: "fr-fr" },
      { locale: "fr", code: "fr" },
    ]);
    expect(assignment.collisions).toEqual([]);
    expect(assignment.unmapped).toEqual([]);
  });
});

describe("hubspot language and copy names", () => {
  it("treats an empty object language as the project source", () => {
    expect(
      hubspotLanguageMatchesSource({
        objectLanguage: "",
        projectSourceLocale: "en",
        surface: "email",
      }),
    ).toBe(true);
    expect(
      hubspotLanguageMatchesSource({
        objectLanguage: "fr",
        projectSourceLocale: "en",
        surface: "email",
      }),
    ).toBe(false);
  });

  it("keeps the full project tag in the copy name", () => {
    expect(hubspotCopyName("Welcome", "fr-FR")).toBe("Welcome [fr-FR]");
    expect(isHubspotLocaleCopyName("Welcome [fr-FR]")).toBe(true);
    expect(isHubspotLocaleCopyName("Welcome")).toBe(false);
  });
});
