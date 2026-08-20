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

import { contextualHeuristicScorers } from "./heuristics/contextual";
import { linguisticHeuristicScorers } from "./heuristics/linguistic";
import { technicalHeuristicScorers } from "./heuristics/technical";
import { visualHeuristicScorers } from "./heuristics/visual";
import { detectLocales } from "./shared";
import type { AuditCreditContext } from "./types";
import { EMPTY_SITEMAP_SIGNAL, emptyCrawledPage } from "../types";

function context(
  pages: ReturnType<typeof emptyCrawledPage>[],
  extras?: Partial<AuditCreditContext>,
): AuditCreditContext {
  const focusLocales = extras?.focusLocales ?? [];
  return {
    pages,
    focusLocales,
    detectedLocales: extras?.detectedLocales ?? detectLocales(pages, focusLocales),
    sitemap: extras?.sitemap ?? EMPTY_SITEMAP_SIGNAL,
  };
}

describe("technical heuristic credits", () => {
  it("flags html lang mismatches against the URL locale", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "en",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.score).toBeLessThan(100);
    expect(outcome.findings.some((finding) => finding.id.includes("mismatch"))).toBe(true);
    expect(outcome.findings.find((finding) => finding.id.includes("mismatch"))?.advice).toContain(
      'html lang="fr"',
    );
  });

  it("maps region path prefixes to BCP 47 html lang suggestions", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/au/services",
          htmlLang: "fr",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    const mismatch = outcome.findings.find((finding) => finding.id.includes("mismatch"));
    expect(mismatch?.advice).toBe('Set html lang="en-AU" so it matches this page’s URL locale.');
    expect(mismatch?.advice).not.toContain('html lang="au"');
  });

  it("does not flag nb-NO html lang on a /no/ path as a mismatch", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/no/tjenester",
          htmlLang: "nb-NO",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.includes("mismatch"))).toBe(false);
    expect(outcome.score).toBe(100);
  });

  it("does not flag en html lang on an /au/ path as a mismatch", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/au/services",
          htmlLang: "en",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.includes("mismatch"))).toBe(false);
    expect(outcome.score).toBe(100);
  });

  it("accepts UN M.49 html lang tags such as es-419", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.includes("invalid"))).toBe(false);
    expect(outcome.findings.some((finding) => finding.id.includes("mismatch"))).toBe(false);
    expect(outcome.score).toBe(100);
  });

  it("still flags html lang values that are not BCP 47 tags", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/",
          htmlLang: "espanol",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.title === "Incorrect language code")).toBe(
      true,
    );
    expect(outcome.score).toBeLessThan(100);
  });

  it("emits one missing-language finding for many pages", () => {
    const outcome = technicalHeuristicScorers["locale-detection"]!(
      context([
        emptyCrawledPage({ url: "https://example.com/", htmlLang: null }),
        emptyCrawledPage({ url: "https://example.com/about", htmlLang: null }),
        emptyCrawledPage({ url: "https://example.com/pricing", htmlLang: null }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    const missing = outcome.findings.filter(
      (finding) => finding.title === "Missing language declaration",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.summary).toContain("3 sampled pages");
  });

  it("scores missing hreflang as high severity when multiple locales exist", () => {
    const outcome = technicalHeuristicScorers.hreflang!(
      context([
        emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" }),
        emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
      ]),
    );

    expect(outcome).toEqual(
      expect.objectContaining({
        status: "scored",
        score: 38,
        findings: [
          expect.objectContaining({
            id: "hreflang-missing",
            severity: "high",
          }),
        ],
      }),
    );
  });

  it("flags hreflang targets that resolve to failing sampled pages", () => {
    const outcome = technicalHeuristicScorers.hreflang!(
      context([
        emptyCrawledPage({
          url: "https://example.com/",
          htmlLang: "en",
          hreflang: [
            { locale: "fr", href: "https://example.com/fr" },
            { locale: "x-default", href: "https://example.com/" },
          ],
        }),
        emptyCrawledPage({ url: "https://example.com/fr", status: 404, htmlLang: "fr" }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^hreflang-broken-/),
          severity: "critical",
          url: "https://example.com/fr",
        }),
      ]),
    );
  });

  it("penalises canonical URLs that point at another locale", () => {
    const outcome = technicalHeuristicScorers["canonical-urls"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          canonical: "https://example.com/en/pricing",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("canonical-locale-"))).toBe(
      true,
    );
    expect(outcome.score).toBeLessThan(80);
  });

  it("does not flag same-region canonical URLs as cross-locale", () => {
    const outcome = technicalHeuristicScorers["canonical-urls"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/au/pricing",
          htmlLang: "en-AU",
          canonical: "https://example.com/au/pricing",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("canonical-locale-"))).toBe(
      false,
    );
    expect(outcome.score).toBe(100);
  });

  it("accepts og:locale nb_NO on a Norwegian /no/ page", () => {
    const outcome = technicalHeuristicScorers["localized-seo-metadata"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          title: "Pricing",
          metaDescription: "Plans for teams",
          ogLocale: "en_US",
        }),
        emptyCrawledPage({
          url: "https://example.com/no/pricing",
          htmlLang: "no",
          title: "Priser",
          metaDescription: "Planer for team",
          ogLocale: "nb_NO",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("seo-og-locale-"))).toBe(false);
    expect(outcome.score).toBe(100);
  });

  it("still flags og:locale that is a different language", () => {
    const outcome = technicalHeuristicScorers["localized-seo-metadata"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          title: "Pricing",
          ogLocale: "en_US",
        }),
        emptyCrawledPage({
          url: "https://example.com/no/pricing",
          htmlLang: "no",
          title: "Priser",
          ogLocale: "sv_SE",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("seo-og-locale-"))).toBe(true);
    expect(outcome.score).toBeLessThan(100);
  });

  it("accepts JSON-LD inLanguage nb on a /no/ page", () => {
    const outcome = technicalHeuristicScorers["structured-data"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/no/pricing",
          htmlLang: "no",
          jsonLd: [{ type: "WebPage", inLanguage: "nb" }],
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("jsonld-language-"))).toBe(
      false,
    );
    expect(outcome.score).toBe(100);
  });

  it("does not treat same-region nav links as language switchers", () => {
    const outcome = technicalHeuristicScorers["language-switcher"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/au/pricing",
          htmlLang: "en-AU",
          anchors: [
            { href: "/au/", text: "Home" },
            { href: "/au/about", text: "About" },
            { href: "/fr/pricing", text: "Français" },
          ],
        }),
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          anchors: [
            { href: "/fr/", text: "Accueil" },
            { href: "/au/pricing", text: "English" },
          ],
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.score).toBeGreaterThanOrEqual(75);
    expect(outcome.findings.some((finding) => finding.id === "language-switcher-homepage")).toBe(
      false,
    );
  });

  it("treats locale-root links as the same page when already on a locale homepage", () => {
    const outcome = technicalHeuristicScorers["language-switcher"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/de/",
          htmlLang: "de",
          anchors: [
            { href: "https://www.dropbox.com/es/", text: "Español" },
            { href: "https://www.dropbox.com/fr/", text: "Français" },
          ],
        }),
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
          anchors: [
            { href: "https://www.dropbox.com/de/", text: "Deutsch" },
            { href: "https://www.dropbox.com/fr/", text: "Français" },
          ],
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.score).toBeGreaterThanOrEqual(90);
    expect(outcome.findings.some((finding) => finding.id === "language-switcher-homepage")).toBe(
      false,
    );
  });

  it("still flags language links that drop a nested path to the locale homepage", () => {
    const outcome = technicalHeuristicScorers["language-switcher"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/de/business",
          htmlLang: "de",
          anchors: [{ href: "https://www.dropbox.com/es/", text: "Español" }],
        }),
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/business",
          htmlLang: "es",
          anchors: [{ href: "https://www.dropbox.com/de/", text: "Deutsch" }],
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id === "language-switcher-homepage")).toBe(
      true,
    );
    expect(outcome.score).toBeLessThan(75);
  });

  it("fails like Lighthouse when no valid sitemap is discoverable", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context([emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" })]),
    );
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "scored",
        score: 18,
        findings: [
          expect.objectContaining({
            id: "sitemap-missing",
            severity: "high",
          }),
        ],
      }),
    );
  });

  it("flags a reachable sitemap that robots.txt does not reference", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context(
        [
          emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" }),
          emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
        ],
        {
          sitemap: {
            robotsFound: true,
            robotsSitemapDirectives: [],
            robotsHasRelativeSitemapDirective: false,
            sitemapUrls: ["https://example.com/sitemap.xml"],
            localizedUrls: ["https://example.com/fr/pricing"],
          },
        },
      ),
    );
    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sitemap-robots-unreferenced",
          severity: "high",
        }),
      ]),
    );
    expect(outcome.score).toBeLessThan(80);
  });

  it("flags missing localized URLs when robots.txt references the sitemap", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context(
        [
          emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" }),
          emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
        ],
        {
          sitemap: {
            robotsFound: true,
            robotsSitemapDirectives: ["https://example.com/sitemap.xml"],
            robotsHasRelativeSitemapDirective: false,
            sitemapUrls: ["https://example.com/sitemap.xml"],
            localizedUrls: [],
          },
        },
      ),
    );
    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id === "sitemap-missing-locales")).toBe(true);
    expect(outcome.score).toBeLessThan(70);
  });

  it("scores a sitemap that lists locale URLs and is referenced from robots.txt", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context(
        [
          emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" }),
          emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
        ],
        {
          sitemap: {
            robotsFound: true,
            robotsSitemapDirectives: ["https://example.com/sitemap.xml"],
            robotsHasRelativeSitemapDirective: false,
            sitemapUrls: ["https://example.com/sitemap.xml"],
            localizedUrls: ["https://example.com/fr/pricing"],
          },
        },
      ),
    );
    expect(outcome).toEqual({ status: "scored", score: 100, findings: [] });
  });

  it("flags relative Sitemap directives and incomplete locale coverage", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context(
        [
          emptyCrawledPage({ url: "https://example.com/en/", htmlLang: "en" }),
          emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
        ],
        {
          sitemap: {
            robotsFound: true,
            robotsSitemapDirectives: ["https://example.com/sitemap.xml"],
            robotsHasRelativeSitemapDirective: true,
            sitemapUrls: ["https://example.com/sitemap.xml"],
            localizedUrls: ["https://example.com/fr/pricing"],
          },
        },
      ),
    );
    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.map((finding) => finding.id).toSorted()).toEqual([
      "sitemap-incomplete-locales",
      "sitemap-robots-relative",
    ]);
  });

  it("detects subdomain locale signals and normalizes underscore locale tags", () => {
    const locales = detectLocales(
      [
        emptyCrawledPage({
          url: "https://fr.example.com/",
          htmlLang: "fr_FR",
          hreflang: [{ locale: "x-default", href: "https://example.com/" }],
        }),
      ],
      ["pt_BR"],
    );
    expect(locales.map((entry) => entry.locale).toSorted()).toEqual(["fr-fr", "pt-br"]);
    expect(locales.find((entry) => entry.locale === "fr-fr")?.source).toBe("html_lang");
    expect(locales.some((entry) => entry.locale === "x-default")).toBe(false);
  });

  it("resolves English language names in focus locales", () => {
    const locales = detectLocales([], ["French", "German"]);
    expect(locales.map((entry) => entry.locale).toSorted()).toEqual(["de", "fr"]);
    expect(locales.every((entry) => entry.source === "focus")).toBe(true);
  });

  it("keeps subdomain language when html lang is absent", () => {
    const locales = detectLocales(
      [emptyCrawledPage({ url: "https://fr.example.com/", htmlLang: null })],
      [],
    );
    expect(locales.map((entry) => entry.locale)).toEqual(["fr"]);
    expect(locales[0]?.source).toBe("url_subdomain");
  });

  it("maps region URL prefixes to language-region locale signals", () => {
    const locales = detectLocales(
      [emptyCrawledPage({ url: "https://example.com/au/pricing", htmlLang: "en" })],
      [],
    );
    expect(locales.map((entry) => entry.locale)).toEqual(["en-au"]);
    expect(locales[0]?.source).toBe("url_prefix");
  });

  it("keeps UN M.49 html lang tags such as es-419", () => {
    const locales = detectLocales(
      [emptyCrawledPage({ url: "https://www.dropbox.com/es/", htmlLang: "es-419" })],
      [],
    );
    expect(locales.map((entry) => entry.locale)).toEqual(["es-419"]);
    expect(locales[0]?.source).toBe("html_lang");
  });

  it("keeps bare language and region markets as distinct locales", () => {
    const locales = detectLocales(
      [
        emptyCrawledPage({ url: "https://example.com/en/pricing", htmlLang: "en" }),
        emptyCrawledPage({ url: "https://example.com/au/pricing", htmlLang: "en" }),
      ],
      [],
    );
    expect(locales.map((entry) => entry.locale).toSorted()).toEqual(["en", "en-au"]);
  });

  it("marks cross-page consistency N/A so noisy nav labels are skipped", () => {
    const outcome = linguisticHeuristicScorers["cross-page-consistency"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/en/a",
          htmlLang: "en",
          anchors: [{ href: "/intl-en/digital-gov", text: "Digital gov" }],
        }),
        emptyCrawledPage({
          url: "https://example.com/en/b",
          htmlLang: "en",
          anchors: [{ href: "/intl-en/digital-gov", text: "Digital GOV" }],
        }),
      ]),
    );
    expect(outcome.status).toBe("na");
  });

  it("flags Eastern Arabic-Indic numerals and Hijri-only dates on Arabic pages", () => {
    const outcome = technicalHeuristicScorers["international-formatting"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ar/pricing",
          htmlLang: "ar",
          textSample: "السعر ١٢٣ ر.س. تاريخ الإطلاق: ١٥ رمضان ١٤٤٦",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^formatting-arabic-numerals-/),
        expect.stringMatching(/^formatting-hijri-calendar-/),
      ]),
    );
  });

  it("accepts Western digits and Gregorian Arabic month names", () => {
    const outcome = technicalHeuristicScorers["international-formatting"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ar/blog",
          htmlLang: "ar",
          textSample: "نشر في 14 أغسطس 2026 بسعر 99 ر.س.",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.score).toBeGreaterThanOrEqual(90);
    expect(outcome.findings).toHaveLength(0);
  });

  it("does not score international formatting when the sample has no dates, numbers, or currency", () => {
    const outcome = technicalHeuristicScorers["international-formatting"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
          headings: ["Almacena, comparte y accede a tus archivos"],
          textSample:
            "Dropbox te permite almacenar fotos, documentos y videos. Comparte carpetas y colabora en archivos.",
        }),
        emptyCrawledPage({
          url: "https://www.dropbox.com/de/",
          htmlLang: "de",
          headings: ["Dateien speichern, teilen und darauf zugreifen"],
          textSample:
            "Mit Dropbox kannst du Fotos, Dokumente und Videos speichern. Teile Ordner und arbeite an Dateien zusammen.",
        }),
      ]),
    );

    expect(outcome.status).toBe("na");
  });

  it("does not score accessibility localisation when there are no accessible names", () => {
    const outcome = technicalHeuristicScorers["accessibility-localisation"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
          textSample: "Almacena fotos, documentos y videos.",
        }),
      ]),
    );

    expect(outcome.status).toBe("na");
  });
});

describe("linguistic heuristic credits", () => {
  it("flags English-looking copy on CJK locale pages and skips English URLs", () => {
    const outcome = linguisticHeuristicScorers["translation-completeness"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/en-us/pricing",
          htmlLang: "en-US",
          textSample: "Buy now. Pricing plans for growing teams around the world today.",
        }),
        emptyCrawledPage({
          url: "https://example.com/ja/pricing",
          htmlLang: "ja",
          textSample: "Buy now. Pricing plans for growing teams around the world today and more.",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(
      outcome.findings.some((finding) => finding.id.startsWith("completeness-untranslated-")),
    ).toBe(true);
  });

  it("keeps Latin-script completeness inconclusive when there is no exact CTA overlap", () => {
    const outcome = linguisticHeuristicScorers["translation-completeness"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          buttons: ["Start free trial"],
          textSample: "Welcome to our pricing page for growing product teams worldwide.",
        }),
        emptyCrawledPage({
          url: "https://example.com/fr/pricing",
          htmlLang: "fr",
          buttons: ["Commencer l'essai"],
          textSample: "Bienvenue sur notre page tarifs pour les equipes produit.",
        }),
      ]),
    );

    expect(outcome.status).toBe("inconclusive");
  });

  it("does not treat shared CSS leaked into buttons as an untranslated CTA", () => {
    const shimmer =
      "@keyframes shimmer { 0% { background-position: 250% 0; } 100% { background-position: -250% 0; } }";
    const outcome = linguisticHeuristicScorers["translation-completeness"]!(
      context([
        emptyCrawledPage({
          url: "https://www.weex.com/",
          htmlLang: "en",
          buttons: [shimmer, "Get started"],
          textSample: "Trade crypto with a global exchange built for growing teams worldwide.",
        }),
        emptyCrawledPage({
          url: "https://www.weex.com/vi",
          htmlLang: "vi",
          buttons: [shimmer, "Bắt đầu ngay"],
          textSample: "Giao dịch tiền mã hóa trên sàn toàn cầu dành cho các nhóm đang phát triển.",
        }),
        emptyCrawledPage({
          url: "https://www.weex.com/de",
          htmlLang: "de",
          buttons: [shimmer, "Jetzt starten"],
          textSample: "Handle Krypto auf einer globalen Börse für wachsende Teams weltweit.",
        }),
      ]),
    );

    expect(outcome.status).toBe("inconclusive");
    if (outcome.status !== "inconclusive") return;
    expect(
      (outcome.findings ?? []).some((finding) => finding.title === "Untranslated call to action"),
    ).toBe(false);
  });

  it("still flags leftover source-language CTA copy on Latin-script locale pages", () => {
    const outcome = linguisticHeuristicScorers["translation-completeness"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/en/pricing",
          htmlLang: "en",
          buttons: ["@keyframes shimmer { 0% { background-position: 250% 0; } }", "Get started"],
          textSample: "Welcome to our pricing page for growing product teams worldwide.",
        }),
        emptyCrawledPage({
          url: "https://example.com/vi/pricing",
          htmlLang: "vi",
          buttons: ["@keyframes shimmer { 0% { background-position: 250% 0; } }", "Get started"],
          textSample: "Chào mừng đến trang giá dành cho các nhóm sản phẩm đang phát triển.",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    const cta = outcome.findings.find((finding) => finding.title === "Untranslated call to action");
    expect(cta?.evidence).toBe('Primary CTA: "Get started"');
    expect(cta?.where).toBe("Primary action · <button>");
    expect(cta?.evidence).not.toContain("@keyframes");
  });
});

describe("contextual heuristic credits", () => {
  it("does not score cultural adaptation when the sample has no currency or contact details", () => {
    const outcome = contextualHeuristicScorers["cultural-adaptation"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
          headings: ["Almacena y comparte archivos"],
          textSample: "Almacena fotos, documentos y videos. Comparte carpetas con tu equipo.",
        }),
        emptyCrawledPage({
          url: "https://www.dropbox.com/de/",
          htmlLang: "de",
          headings: ["Dateien speichern und teilen"],
          textSample: "Speichere Fotos, Dokumente und Videos. Teile Ordner mit deinem Team.",
        }),
      ]),
    );

    expect(outcome.status).toBe("na");
  });

  it("still flags US-style dollar amounts on a non-English page", () => {
    const outcome = contextualHeuristicScorers["cultural-adaptation"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/de/pricing",
          htmlLang: "de",
          textSample: "Pläne ab $12 pro Monat für Teams.",
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("cultural-"))).toBe(true);
  });
});

describe("visual heuristic credits", () => {
  it("fails RTL pages that omit dir=rtl", () => {
    const outcome = visualHeuristicScorers["rtl-support"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ar",
          htmlLang: "ar",
          dir: null,
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.score).toBeLessThan(60);
    expect(outcome.findings[0]?.severity).toBe("critical");
    expect(outcome.findings[0]?.id).toBe("rtl-missing-dir");
  });

  it("flags RTL CSS direction:ltr and physical left/right properties", () => {
    const outcome = visualHeuristicScorers["rtl-support"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ar",
          htmlLang: "ar",
          dir: "rtl",
          directionValues: ["ltr"],
          physicalHorizontalCss: ["float: left", "margin-left: 16px"],
          logicalHorizontalCss: [],
        }),
      ]),
    );
    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^rtl-css-direction-ltr-/),
        expect.stringMatching(/^rtl-css-physical-/),
      ]),
    );
  });

  it("marks RTL support N/A when no RTL locale is present", () => {
    const outcome = visualHeuristicScorers["rtl-support"]!(
      context([emptyCrawledPage({ url: "https://example.com/fr", htmlLang: "fr", dir: "ltr" })]),
    );
    expect(outcome.status).toBe("na");
  });

  it("flags Korean break-all, Western name fields, and tofu glyphs", () => {
    const wordBreak = visualHeuristicScorers["cjk-typography"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ko",
          htmlLang: "ko",
          textSample: "한국어 본문 예시입니다. 더 많은 한글 텍스트가 필요합니다.",
          wordBreakValues: ["break-all"],
          formFieldLabels: ["First name", "last_name"],
          fontFamilies: ["Arial"],
        }),
      ]),
    );
    expect(wordBreak.status).toBe("scored");
    if (wordBreak.status !== "scored") return;
    expect(wordBreak.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^cjk-wordbreak-breakall-/),
        expect.stringMatching(/^cjk-naming-/),
      ]),
    );

    const fonts = visualHeuristicScorers["font-and-script"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ko",
          htmlLang: "ko",
          textSample: "한글과 tofu □ 가 함께 있습니다.",
          fontFamilies: ["Arial", "sans-serif"],
        }),
      ]),
    );
    expect(fonts.status).toBe("scored");
    if (fonts.status !== "scored") return;
    expect(fonts.findings.some((finding) => finding.id.startsWith("font-tofu-"))).toBe(true);
    expect(fonts.findings.some((finding) => finding.title.includes("CJK-capable"))).toBe(true);
  });

  it("passes Korean pages with keep-all and a CJK font", () => {
    const outcome = visualHeuristicScorers["cjk-typography"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/ko",
          htmlLang: "ko",
          textSample: "한국어 본문 예시입니다. 더 많은 한글 텍스트가 필요합니다.",
          wordBreakValues: ["keep-all"],
          formFieldLabels: ["성", "이름"],
          fontFamilies: ["Noto Sans KR"],
        }),
      ]),
    );
    expect(outcome).toEqual({ status: "scored", score: 92, findings: [] });
  });

  it("does not score visual hierarchy when headings are not excessively long", () => {
    const outcome = visualHeuristicScorers["visual-hierarchy"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
          headings: ["Almacena, comparte y accede a tus archivos"],
        }),
      ]),
    );

    expect(outcome.status).toBe("na");
  });

  it("still flags headings that are excessively long", () => {
    const outcome = visualHeuristicScorers["visual-hierarchy"]!(
      context([
        emptyCrawledPage({
          url: "https://example.com/de/",
          htmlLang: "de",
          headings: [
            "Speichere, teile und greife von jedem Gerät aus auf alle deine Dateien, Fotos und Dokumente zu, jederzeit und überall",
          ],
        }),
      ]),
    );

    expect(outcome.status).toBe("scored");
    if (outcome.status !== "scored") return;
    expect(outcome.findings.some((finding) => finding.id.startsWith("hierarchy-heading-"))).toBe(
      true,
    );
  });

  it("does not score component consistency when button counts match across locales", () => {
    const outcome = visualHeuristicScorers["component-consistency"]!(
      context([
        emptyCrawledPage({
          url: "https://www.dropbox.com/en/",
          htmlLang: "en",
          buttons: ["Get started", "Sign in"],
        }),
        emptyCrawledPage({
          url: "https://www.dropbox.com/es/",
          htmlLang: "es-419",
          buttons: ["Comenzar", "Iniciar sesión"],
        }),
      ]),
    );

    expect(outcome.status).toBe("na");
  });
});
