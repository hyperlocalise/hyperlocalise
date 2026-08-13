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
    expect(locales.map((entry) => entry.locale).toSorted()).toEqual(["fr", "fr-fr", "pt-br"]);
    expect(locales.find((entry) => entry.locale === "fr")?.source).toBe("url_subdomain");
    expect(locales.some((entry) => entry.locale === "x-default")).toBe(false);
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
