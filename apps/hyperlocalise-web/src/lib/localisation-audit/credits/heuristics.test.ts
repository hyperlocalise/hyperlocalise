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

  it("marks sitemap N/A when none was found", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context([emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" })]),
    );
    expect(outcome.status).toBe("na");
  });

  it("marks sitemap N/A when none was fetched, even if robots.txt exists", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context(
        [
          emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" }),
          emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
        ],
        {
          sitemap: {
            robotsFound: true,
            sitemapUrls: [],
            localizedUrls: [],
          },
        },
      ),
    );
    expect(outcome.status).toBe("na");
  });

  it("scores a sitemap that lists locale URLs", () => {
    const outcome = technicalHeuristicScorers.sitemap!(
      context(
        [
          emptyCrawledPage({ url: "https://example.com/", htmlLang: "en" }),
          emptyCrawledPage({ url: "https://example.com/fr/", htmlLang: "fr" }),
        ],
        {
          sitemap: {
            robotsFound: true,
            sitemapUrls: ["https://example.com/sitemap.xml"],
            localizedUrls: ["https://example.com/fr/pricing"],
          },
        },
      ),
    );
    expect(outcome).toEqual({ status: "scored", score: 92, findings: [] });
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
    expect(outcome.score).toBe(28);
    expect(outcome.findings[0]?.severity).toBe("critical");
  });

  it("marks RTL support N/A when no RTL locale is present", () => {
    const outcome = visualHeuristicScorers["rtl-support"]!(
      context([emptyCrawledPage({ url: "https://example.com/fr", htmlLang: "fr", dir: "ltr" })]),
    );
    expect(outcome.status).toBe("na");
  });
});
