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

import { AVAILABLE_APP_CONTENT_LOCALES } from "./locales";
import { getIntlShape } from "./intl";

describe("getIntlShape", () => {
  it("returns empty messages for the source locale", () => {
    expect(getIntlShape("en").messages).toEqual({});
  });

  it("binds every content locale to intl", () => {
    for (const locale of AVAILABLE_APP_CONTENT_LOCALES) {
      if (locale === "en") {
        continue;
      }

      expect(getIntlShape(locale).locale).toBe(locale);
    }
  });

  it("loads non-empty translated catalogs where sync has landed", () => {
    for (const locale of ["zh-CN", "vi-VN", "de-DE", "fr-FR"] as const) {
      expect(Object.keys(getIntlShape(locale).messages).length).toBeGreaterThan(0);
    }
  });

  it("falls back to the default locale for unknown locales", () => {
    expect(getIntlShape("sv-SE").locale).toBe("en");
    expect(getIntlShape("sv-SE").messages).toEqual({});
  });
});
