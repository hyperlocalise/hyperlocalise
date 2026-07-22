/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";
import { createIntl } from "@formatjs/intl";

import {
  commonLocaleDisplayNameMessages,
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
  getCommonLocaleDisplayNameMessage,
} from "./locale-display-names.messages";
import { COMMON_LOCALES } from "./locales";

describe("locale-display-names.messages", () => {
  const intl = createIntl({ locale: "en", messages: {} });

  it("defines a message for every common locale", () => {
    for (const locale of COMMON_LOCALES) {
      expect(getCommonLocaleDisplayNameMessage(locale)).toBeDefined();
    }
    expect(Object.keys(commonLocaleDisplayNameMessages)).toHaveLength(COMMON_LOCALES.length);
  });

  it("formats known locales via defineMessages and appends the code", () => {
    expect(formatLocaleDisplayName(intl, "fr-FR")).toBe("French (France)");
    expect(formatLocaleOptionLabel(intl, "fr-FR")).toBe("French (France) (fr-FR)");
    expect(formatLocaleOptionLabel(intl, "en")).toBe("English (en)");
  });

  it("falls back to Intl.DisplayNames for unknown BCP-47 tags", () => {
    expect(formatLocaleDisplayName(intl, "sw-KE")).toContain("Swahili");
    expect(formatLocaleOptionLabel(intl, "sw-KE")).toMatch(/\(sw-KE\)$/);
  });

  it("formats language-only tags like provider locale ids", () => {
    expect(formatLocaleDisplayName(intl, "vi")).toBe("Vietnamese");
    expect(formatLocaleOptionLabel(intl, "vi")).toBe("Vietnamese (vi)");
  });
});
