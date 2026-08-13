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
import type { LocalisationAuditCrawledPage, LocalisationAuditFinding } from "../../types";
import {
  clampScore,
  creditFinding,
  languageOf,
  looksPrimarilyEnglish,
  normalizeLocale,
  pageLocale,
  pathLocaleFromUrl,
  pathWithoutLocale,
} from "../shared";
import type { HeuristicCreditOutcome, HeuristicScorer } from "../types";

function scored(score: number, findings: LocalisationAuditFinding[]): HeuristicCreditOutcome {
  return { status: "scored", score: clampScore(score), findings };
}

function isSuccessful(page: LocalisationAuditCrawledPage): boolean {
  return page.status >= 200 && page.status < 400;
}

const scoreLocaleDetection: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  const okPages = context.pages.filter(isSuccessful);
  if (okPages.length === 0) {
    return scored(0, [
      creditFinding({
        id: "locale-detection-no-pages",
        creditId: "locale-detection",
        category: "technical",
        severity: "critical",
        title: "Could not inspect page language",
        summary: "No successful HTML pages were available to check html lang.",
        confidence: 100,
      }),
    ]);
  }

  let missingLang = 0;
  for (const page of okPages) {
    if (!page.htmlLang) {
      missingLang += 1;
      if (findings.length < 5) {
        findings.push(
          creditFinding({
            id: `locale-detection-missing-${findings.length}`,
            creditId: "locale-detection",
            category: "technical",
            severity: "high",
            title: "Missing language declaration",
            summary:
              "The page does not set html lang, so browsers and assistive tech cannot identify the locale.",
            url: page.url,
          }),
        );
      }
    } else if (!/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(page.htmlLang.trim())) {
      score -= 12;
      findings.push(
        creditFinding({
          id: `locale-detection-invalid-${findings.length}`,
          creditId: "locale-detection",
          category: "technical",
          severity: "medium",
          title: "Incorrect language code",
          summary: `html lang "${page.htmlLang}" is not a well-formed language or locale tag.`,
          url: page.url,
          evidence: page.htmlLang,
        }),
      );
    }

    const pathLocale = pathLocaleFromUrl(page.url);
    if (
      pathLocale &&
      page.htmlLang &&
      normalizeLocale(pathLocale) !== normalizeLocale(page.htmlLang)
    ) {
      score -= 18;
      findings.push(
        creditFinding({
          id: `locale-detection-mismatch-${findings.length}`,
          creditId: "locale-detection",
          category: "technical",
          severity: "high",
          title: "URL locale and html lang disagree",
          summary: `Path suggests ${pathLocale} but html lang is ${page.htmlLang}.`,
          url: page.url,
          evidence: `path=${pathLocale}; lang=${page.htmlLang}`,
        }),
      );
    }
  }

  if (missingLang > 0) {
    score -= Math.min(60, missingLang * 20);
  }
  return scored(score, findings);
};

const scoreLocaleRouting: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  const failed = context.pages.filter((page) => !isSuccessful(page));
  for (const page of failed.slice(0, 5)) {
    const critical = page.status === 404;
    score -= critical ? 28 : 12;
    findings.push(
      creditFinding({
        id: `locale-routing-http-${page.status}-${findings.length}`,
        creditId: "locale-routing",
        category: "technical",
        severity: critical ? "critical" : "high",
        title: `Page returned HTTP ${page.status}`,
        summary: "A sampled localisation URL did not return a successful HTML response.",
        url: page.url,
        confidence: 100,
      }),
    );
  }

  const strategies = new Set<string>();
  for (const page of context.pages) {
    if (pathLocaleFromUrl(page.url)) strategies.add("prefix");
    try {
      const host = new URL(page.url).hostname;
      if (/^[a-z]{2}(?:-[a-z]{2})?\./i.test(host) && !host.toLowerCase().startsWith("www.")) {
        strategies.add("subdomain");
      }
    } catch {
      // ignore
    }
  }
  if (strategies.size > 1) {
    score -= 10;
    findings.push(
      creditFinding({
        id: "locale-routing-inconsistent",
        creditId: "locale-routing",
        category: "technical",
        severity: "medium",
        title: "Inconsistent URL structures",
        summary: "The sample mixes locale prefixes and locale subdomains.",
      }),
    );
  }

  if (context.detectedLocales.length <= 1) {
    score -= 8;
    findings.push(
      creditFinding({
        id: "locale-routing-single-locale",
        creditId: "locale-routing",
        category: "technical",
        severity: "info",
        title: "Only one locale signal detected",
        summary:
          "The sample found little evidence of multi-locale routing (hreflang, locale prefixes, or html lang variety).",
        url: context.pages[0]?.url,
        confidence: 90,
      }),
    );
  }

  return scored(score, findings);
};

const LANGUAGE_NAME =
  /^(english|en|français|francais|français|deutsch|de|español|espanol|es|italiano|it|日本語|中文|한국어|العربية|português|portuguese|pt|nederlands|nl|русский|日本語|中文)$/i;

const scoreLanguageSwitcher: HeuristicScorer = (context) => {
  if (context.detectedLocales.length <= 1) {
    return { status: "na" };
  }

  const findings: LocalisationAuditFinding[] = [];
  let preservesPath = 0;
  let localeRootOnly = 0;
  let found = 0;

  for (const page of context.pages.filter(isSuccessful)) {
    const currentPath = pathWithoutLocale(page.url);
    for (const anchor of page.anchors) {
      let href: URL;
      try {
        href = new URL(anchor.href, page.url);
      } catch {
        continue;
      }
      const targetLocale = pathLocaleFromUrl(href.toString());
      const looksLikeSwitcher =
        Boolean(targetLocale) ||
        LANGUAGE_NAME.test(anchor.text.trim()) ||
        LANGUAGE_NAME.test(anchor.href);
      if (!looksLikeSwitcher || !targetLocale) continue;
      if (pageLocale(page) && languageOf(targetLocale) === languageOf(pageLocale(page)!)) {
        continue;
      }
      found += 1;
      const targetPath = pathWithoutLocale(href.toString());
      if (currentPath && targetPath && currentPath !== "/" && targetPath === currentPath) {
        preservesPath += 1;
      } else if (
        targetPath === "/" ||
        (targetPath && targetPath.split("/").filter(Boolean).length <= 1)
      ) {
        localeRootOnly += 1;
      }
    }
  }

  if (found === 0) {
    return {
      status: "inconclusive",
      evidence: { reason: "no_standard_switcher_links" },
    };
  }

  if (localeRootOnly > preservesPath) {
    findings.push(
      creditFinding({
        id: "language-switcher-homepage",
        creditId: "language-switcher",
        category: "technical",
        severity: "high",
        title: "Language links return to the homepage",
        summary: "Locale links were found, but they appear to drop the current page path.",
      }),
    );
    return scored(58, findings);
  }

  return scored(preservesPath > 0 ? 92 : 75, findings);
};

const scoreHreflang: HeuristicScorer = (context) => {
  if (context.detectedLocales.length <= 1) {
    return { status: "na" };
  }

  const findings: LocalisationAuditFinding[] = [];
  const okPages = context.pages.filter(isSuccessful);
  const hasHreflang = okPages.some((page) => page.hreflang.length > 0);
  if (!hasHreflang) {
    return scored(38, [
      creditFinding({
        id: "hreflang-missing",
        creditId: "hreflang",
        category: "technical",
        severity: "high",
        title: "No hreflang annotations found",
        summary:
          "Multiple locale signals were detected, but sampled pages did not expose hreflang alternate links.",
        url: okPages[0]?.url,
        confidence: 100,
      }),
    ]);
  }

  let score = 100;
  const byUrl = new Map(context.pages.map((page) => [page.url, page]));

  for (const page of okPages) {
    if (page.hreflang.length === 0) continue;
    const self = page.hreflang.some((entry) => {
      try {
        return new URL(entry.href, page.url).toString() === new URL(page.url).toString();
      } catch {
        return entry.href === page.url;
      }
    });
    if (!self) {
      score -= 8;
      findings.push(
        creditFinding({
          id: `hreflang-self-${findings.length}`,
          creditId: "hreflang",
          category: "technical",
          severity: "medium",
          title: "Missing hreflang self-reference",
          summary: "The page lists hreflang alternates but does not include itself.",
          url: page.url,
        }),
      );
    }
    if (!page.hreflang.some((entry) => entry.locale.toLowerCase() === "x-default")) {
      score -= 6;
      findings.push(
        creditFinding({
          id: `hreflang-xdefault-${findings.length}`,
          creditId: "hreflang",
          category: "technical",
          severity: "low",
          title: "Missing x-default hreflang",
          summary: "hreflang is present but does not declare an x-default fallback.",
          url: page.url,
        }),
      );
    }

    for (const entry of page.hreflang) {
      if (entry.locale.toLowerCase() === "x-default") continue;
      let absolute: string;
      try {
        absolute = new URL(entry.href, page.url).toString();
      } catch {
        score -= 10;
        findings.push(
          creditFinding({
            id: `hreflang-invalid-${findings.length}`,
            creditId: "hreflang",
            category: "technical",
            severity: "high",
            title: "Invalid hreflang URL",
            summary: `Alternate link for ${entry.locale} is not a valid URL.`,
            url: page.url,
            evidence: entry.href,
          }),
        );
        continue;
      }
      const target =
        byUrl.get(absolute) ??
        [...byUrl.values()].find((candidate) => candidate.url === entry.href);
      if (target && !isSuccessful(target)) {
        score -= 22;
        findings.push(
          creditFinding({
            id: `hreflang-broken-${findings.length}`,
            creditId: "hreflang",
            category: "technical",
            severity: "critical",
            title: `hreflang target returns HTTP ${target.status}`,
            summary: `Alternate link for ${entry.locale} points to a failing URL.`,
            url: absolute,
            evidence: entry.locale,
            confidence: 100,
          }),
        );
      }
    }
  }

  return scored(score, findings);
};

const scoreCanonicalUrls: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  const okPages = context.pages.filter(isSuccessful);
  const withCanonical = okPages.filter((page) => page.canonical);
  if (withCanonical.length === 0) {
    return scored(72, [
      creditFinding({
        id: "canonical-missing",
        creditId: "canonical-urls",
        category: "technical",
        severity: "medium",
        title: "Canonical URLs are missing",
        summary: "Sampled pages did not declare a canonical URL.",
        url: okPages[0]?.url,
      }),
    ]);
  }

  for (const page of withCanonical) {
    const pageLoc = pageLocale(page);
    let canonicalUrl: URL;
    try {
      canonicalUrl = new URL(page.canonical!, page.url);
    } catch {
      score -= 12;
      findings.push(
        creditFinding({
          id: `canonical-invalid-${findings.length}`,
          creditId: "canonical-urls",
          category: "technical",
          severity: "medium",
          title: "Canonical URL is invalid",
          summary: "The canonical href could not be parsed as a URL.",
          url: page.url,
          evidence: page.canonical ?? undefined,
        }),
      );
      continue;
    }
    const canonicalLocale = pathLocaleFromUrl(canonicalUrl.toString());
    if (pageLoc && canonicalLocale && languageOf(pageLoc) !== languageOf(canonicalLocale)) {
      score -= 30;
      findings.push(
        creditFinding({
          id: `canonical-locale-${findings.length}`,
          creditId: "canonical-urls",
          category: "technical",
          severity: "high",
          title: "Canonical points at another locale",
          summary: `This ${pageLoc} page canonicalises to a ${canonicalLocale} URL.`,
          url: page.url,
          evidence: canonicalUrl.toString(),
          confidence: 98,
        }),
      );
    }
  }

  return scored(score, findings);
};

const scoreLocalizedSeoMetadata: HeuristicScorer = (context) => {
  if (context.detectedLocales.length <= 1) {
    return { status: "na" };
  }
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  const byLanguage = new Map<string, LocalisationAuditCrawledPage[]>();
  for (const page of context.pages.filter(isSuccessful)) {
    const locale = pageLocale(page);
    if (!locale) continue;
    const list = byLanguage.get(languageOf(locale)) ?? [];
    list.push(page);
    byLanguage.set(languageOf(locale), list);
  }
  if (byLanguage.size <= 1) {
    return { status: "na" };
  }

  const titles = [...byLanguage.values()].map((pages) => pages[0]?.title ?? "");
  if (titles.every((title) => title) && new Set(titles).size === 1) {
    score -= 35;
    findings.push(
      creditFinding({
        id: "seo-title-not-localized",
        creditId: "localized-seo-metadata",
        category: "technical",
        severity: "medium",
        title: "Page titles are not localized",
        summary: "Sampled locales share the same document title.",
        evidence: titles[0],
      }),
    );
  }

  const descriptions = [...byLanguage.values()].map((pages) => pages[0]?.metaDescription ?? "");
  if (descriptions.every(Boolean) && new Set(descriptions).size === 1) {
    score -= 20;
    findings.push(
      creditFinding({
        id: "seo-description-not-localized",
        creditId: "localized-seo-metadata",
        category: "technical",
        severity: "medium",
        title: "Meta descriptions are not localized",
        summary: "Sampled locales share the same meta description.",
      }),
    );
  }

  for (const [language, pages] of byLanguage) {
    const page = pages[0]!;
    if (page.ogLocale && languageOf(page.ogLocale) !== language) {
      score -= 12;
      findings.push(
        creditFinding({
          id: `seo-og-locale-${findings.length}`,
          creditId: "localized-seo-metadata",
          category: "technical",
          severity: "medium",
          title: "og:locale does not match the page",
          summary: `og:locale is ${page.ogLocale} on a ${language} page.`,
          url: page.url,
          evidence: page.ogLocale,
        }),
      );
    }
  }

  return scored(score, findings);
};

const scoreSitemap: HeuristicScorer = (context) => {
  const { sitemap } = context;
  if (!sitemap.robotsFound && sitemap.sitemapUrls.length === 0) {
    return { status: "na" };
  }
  if (context.detectedLocales.length <= 1) {
    return sitemap.sitemapUrls.length > 0 ? scored(90, []) : { status: "na" };
  }
  if (sitemap.localizedUrls.length === 0) {
    return scored(42, [
      creditFinding({
        id: "sitemap-missing-locales",
        creditId: "sitemap",
        category: "technical",
        severity: "medium",
        title: "Sitemap is missing localized URLs",
        summary: "A sitemap was found, but sampled entries do not include locale-prefixed URLs.",
        confidence: 90,
      }),
    ]);
  }
  return scored(92, []);
};

const scoreStructuredData: HeuristicScorer = (context) => {
  const pages = context.pages.filter((page) => isSuccessful(page) && page.jsonLd.length > 0);
  if (pages.length === 0) {
    return { status: "na" };
  }
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  for (const page of pages) {
    const locale = pageLocale(page);
    for (const node of page.jsonLd) {
      if (!node.inLanguage) {
        score -= 8;
        continue;
      }
      if (locale && languageOf(node.inLanguage) !== languageOf(locale)) {
        score -= 18;
        findings.push(
          creditFinding({
            id: `jsonld-language-${findings.length}`,
            creditId: "structured-data",
            category: "technical",
            severity: "medium",
            title: "Structured data language mismatch",
            summary: `${node.type} inLanguage is ${node.inLanguage} on a ${locale} page.`,
            url: page.url,
            evidence: node.inLanguage,
          }),
        );
      }
    }
  }
  if (findings.length === 0 && score < 100) {
    findings.push(
      creditFinding({
        id: "jsonld-missing-inlanguage",
        creditId: "structured-data",
        category: "technical",
        severity: "low",
        title: "Structured data omits inLanguage",
        summary: "JSON-LD is present but does not declare inLanguage on sampled pages.",
        url: pages[0]?.url,
      }),
    );
  }
  return scored(score, findings);
};

const CURRENCY_BY_LANGUAGE: Record<string, RegExp> = {
  en: /\$|USD|£|GBP/,
  de: /€|EUR|\d{1,3}\.\d{3},\d{2}/,
  fr: /€|EUR|\d{1,3} \d{3}/,
  ja: /¥|￥|JPY|円/,
  zh: /¥|￥|CNY|人民币/,
  ko: /₩|KRW/,
};

const scoreInternationalFormatting: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let sawPattern = false;
  let mismatches = 0;
  for (const page of context.pages.filter(isSuccessful)) {
    const locale = pageLocale(page);
    if (!locale) continue;
    const language = languageOf(locale);
    const expected = CURRENCY_BY_LANGUAGE[language];
    const text = `${page.textSample} ${page.title ?? ""}`;
    const hasDollar = /\$\d/.test(text);
    const hasEuro = /€/.test(text);
    if (expected && expected.test(text)) {
      sawPattern = true;
    }
    if (language !== "en" && hasDollar && !hasEuro && expected) {
      sawPattern = true;
      mismatches += 1;
      findings.push(
        creditFinding({
          id: `formatting-currency-${findings.length}`,
          creditId: "international-formatting",
          category: "technical",
          severity: "high",
          title: "Currency does not match the locale",
          summary: `A ${language} page still shows dollar amounts without a local currency.`,
          url: page.url,
          evidence: text.match(/\$\d[\d,.]*/)?.[0],
        }),
      );
    }
  }
  if (!sawPattern) {
    return { status: "inconclusive", evidence: { reason: "no_formatting_examples" } };
  }
  return scored(mismatches > 0 ? 48 : 90, findings);
};

const scoreAccessibilityLocalisation: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;
  let inspected = 0;
  for (const page of context.pages.filter(isSuccessful)) {
    const locale = pageLocale(page);
    if (!locale || languageOf(locale) === "en") continue;
    const samples = [...page.ariaLabels, ...page.altTexts.map((item) => item.alt)];
    if (samples.length === 0) continue;
    inspected += 1;
    if (isLatinAmbiguous(locale)) {
      return {
        status: "inconclusive",
        findings,
        evidence: { samples: samples.slice(0, 8), locale },
      };
    }
    const englishSamples = samples.filter((sample) => looksPrimarilyEnglish(sample));
    if (englishSamples.length > 0) {
      score -= 18;
      findings.push(
        creditFinding({
          id: `a11y-untranslated-${findings.length}`,
          creditId: "accessibility-localisation",
          category: "technical",
          severity: "medium",
          title: "Accessible names look untranslated",
          summary: `aria-label or alt text on a ${locale} page still looks English.`,
          url: page.url,
          evidence: englishSamples[0],
        }),
      );
    }
  }
  if (inspected === 0) {
    return { status: "inconclusive", evidence: { reason: "no_accessible_names" } };
  }
  return scored(score, findings);
};

function isLatinAmbiguous(locale: string): boolean {
  const language = languageOf(locale);
  return ["fr", "de", "es", "it", "pt", "nl", "sv", "da", "no", "pl", "ro", "cs", "fi"].includes(
    language,
  );
}

export const technicalHeuristicScorers: Record<string, HeuristicScorer> = {
  "locale-detection": scoreLocaleDetection,
  "locale-routing": scoreLocaleRouting,
  "language-switcher": scoreLanguageSwitcher,
  hreflang: scoreHreflang,
  "canonical-urls": scoreCanonicalUrls,
  "localized-seo-metadata": scoreLocalizedSeoMetadata,
  sitemap: scoreSitemap,
  "structured-data": scoreStructuredData,
  "international-formatting": scoreInternationalFormatting,
  "accessibility-localisation": scoreAccessibilityLocalisation,
};
