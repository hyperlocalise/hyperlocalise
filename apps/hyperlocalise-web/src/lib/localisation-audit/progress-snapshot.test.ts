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

  it("caps locales and unique paths and keeps unparseable URLs as-is", () => {
    const snapshot = buildLocalisationAuditProgressSnapshot([
      ...Array.from({ length: 14 }, (_, index) => ({
        url: `https://acme.com/p${index}`,
        htmlLang: `en-${String(index).padStart(2, "0")}`,
        hreflang: [] as { locale: string; href: string }[],
      })),
      {
        url: "https://acme.com/p0",
        htmlLang: "  ",
        hreflang: [{ locale: "x-default", href: "https://acme.com/" }],
      },
      {
        url: "/not-a-url",
        htmlLang: null,
        hreflang: [],
      },
    ]);

    expect(snapshot.pagesCrawled).toBe(16);
    expect(snapshot.locales).toHaveLength(12);
    expect(snapshot.locales[0]).toBe("en-00");
    expect(snapshot.locales.at(-1)).toBe("en-11");
    expect(snapshot.pagePaths).toEqual(["/p0", "/p1", "/p2", "/p3", "/p4", "/p5", "/p6", "/p7"]);
  });

  it("preserves an unparseable URL instead of dropping the page", () => {
    expect(
      buildLocalisationAuditProgressSnapshot([{ url: "not a url", htmlLang: "en", hreflang: [] }])
        .pagePaths,
    ).toEqual(["not a url"]);
  });
});
