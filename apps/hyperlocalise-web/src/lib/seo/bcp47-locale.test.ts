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

import { appLocaleToBcp47Tag, appLocaleToHreflangTag } from "./bcp47-locale";

describe("appLocaleToBcp47Tag", () => {
  it("canonicalizes supported app locales", () => {
    expect(appLocaleToBcp47Tag("en")).toBe("en");
    expect(appLocaleToBcp47Tag("zh-CN")).toBe("zh-CN");
    expect(appLocaleToBcp47Tag("vi-VN")).toBe("vi-VN");
    expect(appLocaleToBcp47Tag("de-DE")).toBe("de-DE");
    expect(appLocaleToBcp47Tag("fr-FR")).toBe("fr-FR");
  });
});

describe("appLocaleToHreflangTag", () => {
  it("maps fil-PH to tl-PH", () => {
    expect(appLocaleToHreflangTag("fil-PH")).toBe("tl-PH");
    expect(appLocaleToBcp47Tag("fil-PH")).toBe("fil-PH");
  });

  it("keeps other locales unchanged", () => {
    expect(appLocaleToHreflangTag("en")).toBe("en");
    expect(appLocaleToHreflangTag("vi-VN")).toBe("vi-VN");
  });
});
