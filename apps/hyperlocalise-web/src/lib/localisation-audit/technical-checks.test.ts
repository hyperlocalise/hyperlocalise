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

import { runTechnicalLocalisationChecks } from "./technical-checks";
import type { LocalisationAuditCrawledPage } from "./types";

function page(
  partial: Partial<LocalisationAuditCrawledPage> & { url: string },
): LocalisationAuditCrawledPage {
  return {
    status: 200,
    htmlLang: null,
    title: null,
    textSample: "",
    hreflang: [],
    ...partial,
  };
}

describe("runTechnicalLocalisationChecks", () => {
  it("matches locale prefixes against absolute URL pathnames", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [
        page({
          url: "https://example.com/fr/pricing",
          htmlLang: "en",
          textSample: "Buy now. Pricing plans for growing teams around the world.",
        }),
      ],
    });

    expect(result.findings.some((finding) => finding.id.startsWith("lang-mismatch-"))).toBe(true);
    expect(result.findings.some((finding) => finding.id.startsWith("untranslated-"))).toBe(true);
    expect(result.detectedLocales.some((locale) => locale.locale === "fr")).toBe(true);
  });

  it("returns a critical finding when no pages were crawled", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: ["fr"],
      pages: [],
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "no-pages",
        severity: "critical",
        category: "technical",
      }),
    ]);
    expect(result.detectedLocales).toEqual([
      expect.objectContaining({ locale: "fr", source: "focus" }),
    ]);
  });

  it("marks 404 sampled pages critical and other HTTP failures as warnings", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [
        page({ url: "https://example.com/", status: 200, htmlLang: "en" }),
        page({ url: "https://example.com/fr", status: 404, htmlLang: "fr" }),
        page({ url: "https://example.com/de", status: 500, htmlLang: "de" }),
      ],
    });

    const httpFindings = result.findings.filter((finding) => finding.id.startsWith("http-"));
    expect(httpFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^http-404-/),
          severity: "critical",
          url: "https://example.com/fr",
        }),
        expect.objectContaining({
          id: expect.stringMatching(/^http-500-/),
          severity: "warning",
          url: "https://example.com/de",
        }),
      ]),
    );
  });

  it("warns when multiple locale signals exist without hreflang annotations", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [
        page({ url: "https://example.com/", htmlLang: "en" }),
        page({ url: "https://example.com/fr/", htmlLang: "fr" }),
      ],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-hreflang",
          severity: "warning",
        }),
      ]),
    );
  });

  it("flags hreflang targets that resolve to failing sampled pages", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [
        page({
          url: "https://example.com/",
          htmlLang: "en",
          hreflang: [
            { locale: "fr", href: "https://example.com/fr" },
            { locale: "x-default", href: "https://example.com/" },
          ],
        }),
        page({ url: "https://example.com/fr", status: 404, htmlLang: "fr" }),
      ],
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^hreflang-broken-/),
          severity: "critical",
          url: "https://example.com/fr",
          evidence: "fr",
        }),
      ]),
    );
    expect(
      result.findings.some(
        (finding) =>
          finding.id.startsWith("hreflang-broken-") && finding.url === "https://example.com/",
      ),
    ).toBe(false);
  });

  it("detects subdomain locale signals and normalizes underscore locale tags", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: ["pt_BR"],
      pages: [
        page({
          url: "https://fr.example.com/",
          htmlLang: "fr_FR",
          hreflang: [{ locale: "x-default", href: "https://example.com/" }],
        }),
      ],
    });

    const locales = result.detectedLocales.map((entry) => entry.locale).toSorted();
    expect(locales).toEqual(["fr", "fr-fr", "pt-br"]);
    expect(result.detectedLocales.find((entry) => entry.locale === "fr")?.source).toBe(
      "url_subdomain",
    );
    expect(result.detectedLocales.some((entry) => entry.locale === "x-default")).toBe(false);
    expect(result.detectedLocales.some((entry) => entry.locale === "www")).toBe(false);
  });

  it("skips English-looking content on English locale URLs and short samples", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [
        page({
          url: "https://example.com/en-us/pricing",
          htmlLang: "en-US",
          textSample: "Buy now. Pricing plans for growing teams around the world today.",
        }),
        page({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          textSample: "Trop court",
        }),
      ],
    });

    expect(result.findings.some((finding) => finding.id.startsWith("untranslated-"))).toBe(false);
    expect(result.findings.some((finding) => finding.id.startsWith("lang-mismatch-"))).toBe(false);
  });

  it("emits single-locale info when only one locale signal is present", () => {
    const result = runTechnicalLocalisationChecks({
      focusLocales: [],
      pages: [page({ url: "https://example.com/", htmlLang: "en" })],
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        id: "single-locale",
        severity: "info",
      }),
    ]);
  });
});
