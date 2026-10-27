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

import { pickSanitySourceLocale } from "./sanity-locale";

describe("pickSanitySourceLocale", () => {
  it("maps a regional project source onto a language-only Sanity tag", () => {
    expect(
      pickSanitySourceLocale({
        catalog: ["de", "en"],
        currentSourceLocale: "en",
        projectSourceLocale: "en-US",
      }),
    ).toBe("en");
  });

  it("does not fall back to the first catalog tag when the project source is unmapped", () => {
    expect(
      pickSanitySourceLocale({
        catalog: ["de", "fr"],
        currentSourceLocale: "en",
        projectSourceLocale: "en-US",
      }),
    ).toBe("");
  });

  it("keeps the current tag when it is still in the catalog and the project source does not map", () => {
    expect(
      pickSanitySourceLocale({
        catalog: ["de", "fr"],
        currentSourceLocale: "de",
        projectSourceLocale: "ja-JP",
      }),
    ).toBe("de");
  });

  it("clears a stale current tag that is no longer in the catalog", () => {
    expect(
      pickSanitySourceLocale({
        catalog: ["en", "de"],
        currentSourceLocale: "ja",
        projectSourceLocale: "ja-JP",
      }),
    ).toBe("");
  });
});
