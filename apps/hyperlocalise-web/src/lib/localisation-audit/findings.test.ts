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

import { evaluateLocalisationAudit } from "./findings";
import type { AuditedPage, ExtractedPage } from "./types";

function extractedPage(overrides: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    url: "https://example.com/en",
    htmlLang: "en-US",
    title: "Product",
    description: "Product description",
    canonicalUrl: "https://example.com/en",
    alternateLinks: [
      {
        locale: "fr-FR",
        url: "https://example.com/fr",
        source: "hreflang",
      },
      {
        locale: "x-default",
        url: "https://example.com",
        source: "hreflang",
      },
    ],
    headings: ["Product"],
    navigation: ["Home"],
    callsToAction: ["Buy now"],
    visibleText:
      "Product for international customers. Buy now for EUR 20. Lorem ipsum placeholder copy that should be replaced before launch.",
    contentFingerprint: "a".repeat(64),
    ...overrides,
  };
}

describe("deterministic localisation audit findings", () => {
  it("returns stable evidence-led findings for the same extracted pages", () => {
    const primary: AuditedPage = {
      url: "https://example.com/en",
      locale: "en-US",
      isPrimary: true,
      status: "extracted",
      httpStatus: 200,
      extracted: extractedPage(),
    };
    const alternative: AuditedPage = {
      url: "https://example.com/fr",
      locale: "fr-FR",
      isPrimary: false,
      status: "extracted",
      httpStatus: 200,
      extracted: extractedPage({
        url: "https://example.com/fr",
        htmlLang: "fr-FR",
        canonicalUrl: "https://example.com/fr",
        alternateLinks: [
          {
            locale: "en-US",
            url: "https://example.com/en",
            source: "hreflang",
          },
        ],
      }),
    };

    const first = evaluateLocalisationAudit({
      pages: [primary, alternative],
      targetLocale: "en-US",
      targetMarket: "US",
    });
    const second = evaluateLocalisationAudit({
      pages: [primary, alternative],
      targetLocale: "en-US",
      targetMarket: "US",
    });

    expect(first).toEqual(second);
    expect(first.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "cross_locale_copy",
        "placeholder_copy",
        "cross_locale_cta_copy",
        "market_currency",
      ]),
    );
    expect(first.findings.find((finding) => finding.code === "placeholder_copy")?.evidence).toEqual(
      { excerpt: "Lorem ipsum" },
    );
  });

  it("records inaccessible alternatives as limitations rather than negative findings", () => {
    const primary: AuditedPage = {
      url: "https://example.com/en",
      locale: "en-US",
      isPrimary: true,
      status: "extracted",
      httpStatus: 200,
      extracted: extractedPage(),
    };
    const blocked: AuditedPage = {
      url: "https://example.com/fr",
      locale: "fr-FR",
      isPrimary: false,
      status: "blocked",
      failureCode: "http_403",
      httpStatus: 403,
    };

    const result = evaluateLocalisationAudit({
      pages: [primary, blocked],
      targetLocale: "en-US",
      targetMarket: "US",
    });

    expect(result.limitations).toEqual([
      "1 explicit locale alternative(s) could not be extracted; comparison checks exclude them.",
    ]);
    expect(result.findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "alternative_unavailable" })]),
    );
  });
});
