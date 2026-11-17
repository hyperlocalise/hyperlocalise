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

import { buildLocalisationAuditProgressSnapshot } from "./progress-snapshot";

describe("buildLocalisationAuditProgressSnapshot", () => {
  it("collects unique locales from html lang and hreflang, skipping x-default", () => {
    const snapshot = buildLocalisationAuditProgressSnapshot([
      {
        url: "https://acme.com/",
        htmlLang: "en",
        hreflang: [
          { locale: "fr-FR", href: "https://acme.com/fr" },
          { locale: "x-default", href: "https://acme.com/" },
        ],
      },
      {
        url: "https://acme.com/fr?ref=nav",
        htmlLang: "FR-fr",
        hreflang: [{ locale: "en", href: "https://acme.com/" }],
      },
    ]);

    expect(snapshot).toEqual({
      pagesCrawled: 2,
      locales: ["en", "fr-FR"],
      pagePaths: ["/", "/fr?ref=nav"],
    });
  });

  it("handles an empty crawl", () => {
    expect(buildLocalisationAuditProgressSnapshot([])).toEqual({
      pagesCrawled: 0,
      locales: [],
      pagePaths: [],
    });
  });
});
