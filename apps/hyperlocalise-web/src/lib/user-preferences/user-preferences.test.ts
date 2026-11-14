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
  buildDefaultUserPreferences,
  defaultHourCycleForLocale,
  formattingLocaleForHourCycle,
  parseUserPreferences,
} from "./user-preferences";

describe("user preferences", () => {
  it("parses a stored appearance bundle", () => {
    expect(
      parseUserPreferences({
        theme: "dark",
        locale: "fr-FR",
        timezone: "Europe/Paris",
        hourCycle: "h23",
      }),
    ).toEqual({
      theme: "dark",
      locale: "fr-FR",
      timezone: "Europe/Paris",
      hourCycle: "h23",
    });
  });

  it("rejects incomplete or invalid bundles", () => {
    expect(parseUserPreferences(null)).toBeNull();
    expect(
      parseUserPreferences({
        theme: "sepia",
        locale: "en",
        timezone: "UTC",
        hourCycle: "h12",
      }),
    ).toBeNull();
    expect(
      parseUserPreferences({
        theme: "light",
        locale: "sv-SE",
        timezone: "UTC",
        hourCycle: "h23",
      }),
    ).toBeNull();
  });

  it("defaults new rows to light theme and the current locale", () => {
    const preferences = buildDefaultUserPreferences("ja-JP");
    expect(preferences.theme).toBe("light");
    expect(preferences.locale).toBe("ja-JP");
    expect(preferences.timezone.length).toBeGreaterThan(0);
    expect(["h12", "h23"]).toContain(preferences.hourCycle);
  });

  it("maps English to a 12-hour cycle and a Unicode formatting locale", () => {
    expect(defaultHourCycleForLocale("en")).toBe("h12");
    expect(formattingLocaleForHourCycle("fr-FR", "h23")).toBe("fr-FR-u-hc-h23");
  });
});
