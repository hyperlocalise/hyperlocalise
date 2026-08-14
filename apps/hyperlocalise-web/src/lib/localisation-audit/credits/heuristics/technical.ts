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
  canonicalPathLocale,
  clampScore,
  clipFindingEvidence,
  creditFinding,
  formatFindingWhere,
  htmlLangMatchesPathLocale,
  htmlLangSuggestionForPathLocale,
  languageOf,
  looksPrimarilyEnglish,
  pageLocale,
  pathLocaleFromUrl,
  pathWithoutLocale,
  textHasEasternArabicDigits,
  textHasGregorianCalendarSignals,
  textHasHijriCalendarSignals,
  textHasWesternDigits,
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
        where: formatFindingWhere({ section: "Document head", tag: "<html lang>" }),
        evidence: "The crawl returned no successful HTML pages to inspect.",
        advice: "Make the sampled localisation URLs return 200 HTML so html lang can be checked.",
        confidence: 100,
      }),
    ]);
  }

  const missingLangPages: LocalisationAuditCrawledPage[] = [];
  for (const page of okPages) {
    if (!page.htmlLang) {
      missingLangPages.push(page);
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
          where: formatFindingWhere({ section: "Document head", tag: "<html lang>" }),
          url: page.url,
          evidence: `<html lang="${page.htmlLang}">`,
          advice: "Use a well-formed BCP 47 language tag, such as en or fr-FR.",
        }),
      );
    }

    const pathLocale = pathLocaleFromUrl(page.url);
    if (pathLocale && page.htmlLang && !htmlLangMatchesPathLocale(page.htmlLang, pathLocale)) {
      const suggested = htmlLangSuggestionForPathLocale(pathLocale);
      score -= 18;
      findings.push(
        creditFinding({
          id: `locale-detection-mismatch-${findings.length}`,
          creditId: "locale-detection",
          category: "technical",
          severity: "high",
          title: "URL locale and html lang disagree",
          summary: `Path locale ${pathLocale} expects html lang ${suggested}, but the page declares ${page.htmlLang}.`,
          where: formatFindingWhere({ section: "Document head", tag: "<html lang>" }),
          url: page.url,
          evidence: `<html lang="${page.htmlLang}"> while the path locale is ${pathLocale}`,
          advice: `Set html lang="${suggested}" so it matches this page’s URL locale.`,
        }),
      );
    }
  }

  if (missingLangPages.length > 0) {
    const missingLang = missingLangPages.length;
    score -= Math.min(60, missingLang * 20);
    const sampleUrls = missingLangPages
      .slice(0, 3)
      .map((page) => page.url)
      .join(", ");
    findings.push(
      creditFinding({
        id: "locale-detection-missing",
        creditId: "locale-detection",
        category: "technical",
        severity: "high",
        title: "Missing language declaration",
        summary:
          missingLang === 1
            ? "The page does not set html lang, so browsers and assistive tech cannot identify the locale."
            : `${missingLang} sampled pages do not set html lang, so browsers and assistive tech cannot identify the locale.`,
        where: formatFindingWhere({ section: "Document head", tag: "<html lang>" }),
        url: missingLangPages[0]?.url,
        evidence:
          missingLang === 1
            ? "html lang is missing"
            : `html lang is missing on ${missingLang} pages, e.g. ${sampleUrls}`,
        advice: "Set html lang to a BCP 47 language tag for each page locale, such as en or fr-FR.",
      }),
    );
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
        where: formatFindingWhere({ section: "Sampled page", tag: "document" }),
        url: page.url,
        evidence: `HTTP ${page.status}`,
        advice: "Fix the localized URL so it returns a successful HTML response.",
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
        where: formatFindingWhere({ section: "Sampled pages", tag: "document" }),
        url: context.pages[0]?.url,
        evidence: `URL strategies in the sample: ${[...strategies].join(" and ")}`,
        advice: "Pick one locale URL pattern (prefix or subdomain) and use it consistently.",
      }),
    );
  }

  if (context.detectedLocales.length <= 1) {
    score -= 28;
    findings.push(
      creditFinding({
        id: "locale-routing-single-locale",
        creditId: "locale-routing",
        category: "technical",
        severity: "medium",
        title: "Only one locale signal detected",
        summary:
          "The sample found little evidence of multi-locale routing (hreflang, locale prefixes, or html lang variety).",
        where: formatFindingWhere({ section: "Sampled pages", tag: "document" }),
        url: context.pages[0]?.url,
        evidence: `Detected locale signals: ${context.detectedLocales.map((entry) => entry.locale).join(", ") || "none"}`,
        advice:
          "Publish additional locales through locale URL prefixes, hreflang alternates, and matching html lang tags.",
        confidence: 90,
      }),
    );
  } else if (context.detectedLocales.length === 2) {
    score -= 8;
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
  let droppedSwitcher: { pageUrl: string; href: string; text: string } | null = null;

  for (const page of context.pages.filter(isSuccessful)) {
    const currentPath = pathWithoutLocale(page.url);
    for (const anchor of page.anchors) {
      let href: URL;
      try {
        href = new URL(anchor.href, page.url);
      } catch {
        continue;
      }
      const targetPathLocale = pathLocaleFromUrl(href.toString());
      const targetLocale = targetPathLocale ? canonicalPathLocale(targetPathLocale) : null;
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
        droppedSwitcher ??= {
          pageUrl: page.url,
          href: href.toString(),
          text: anchor.text.trim() || href.toString(),
        };
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
        where: formatFindingWhere({ section: "Header", tag: "<nav> language links" }),
        url: droppedSwitcher?.pageUrl ?? context.pages[0]?.url,
        evidence: droppedSwitcher
          ? `<a href="${droppedSwitcher.href}">${droppedSwitcher.text}</a> drops the current page path`
          : "Locale links point at locale homepages instead of the equivalent path.",
        advice:
          "Point language-switcher links at the equivalent localized path, not the locale homepage.",
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
        where: formatFindingWhere({
          section: "Document head",
          tag: '<link rel="alternate" hreflang>',
        }),
        url: okPages[0]?.url,
        evidence: 'No <link rel="alternate" hreflang> tags were found on sampled pages.',
        advice: "Add reciprocal hreflang alternate links, including self and x-default.",
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
          where: formatFindingWhere({
            section: "Document head",
            tag: '<link rel="alternate" hreflang>',
          }),
          url: page.url,
          evidence: page.hreflang
            .slice(0, 4)
            .map(
              (entry) => `<link rel="alternate" hreflang="${entry.locale}" href="${entry.href}">`,
            )
            .join("\n"),
          advice: "Add a self-referencing hreflang alternate for this page.",
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
          where: formatFindingWhere({
            section: "Document head",
            tag: '<link rel="alternate" hreflang>',
          }),
          url: page.url,
          evidence: 'hreflang is present but none of the alternates use hreflang="x-default".',
          advice: "Add an x-default hreflang fallback for users whose locale is not listed.",
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
            where: formatFindingWhere({
              section: "Document head",
              tag: '<link rel="alternate" hreflang>',
            }),
            url: page.url,
            evidence: `<link rel="alternate" hreflang="${entry.locale}" href="${entry.href}">`,
            advice: `Use an absolute, valid URL for the ${entry.locale} hreflang alternate.`,
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
            where: formatFindingWhere({
              section: "Document head",
              tag: '<link rel="alternate" hreflang>',
            }),
            url: absolute,
            evidence: `<link rel="alternate" hreflang="${entry.locale}" href="${absolute}"> returns HTTP ${target.status}`,
            advice: `Fix the ${entry.locale} hreflang target so it returns a successful HTML response.`,
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
        where: formatFindingWhere({ section: "Document head", tag: '<link rel="canonical">' }),
        url: okPages[0]?.url,
        evidence: 'No <link rel="canonical"> was found on sampled pages.',
        advice: "Add a canonical URL that points at this locale’s own page.",
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
          where: formatFindingWhere({ section: "Document head", tag: '<link rel="canonical">' }),
          url: page.url,
          evidence: `<link rel="canonical" href="${page.canonical ?? ""}">`,
          advice: "Use an absolute, valid canonical URL for this page.",
        }),
      );
      continue;
    }
    const canonicalPathToken = pathLocaleFromUrl(canonicalUrl.toString());
    const canonicalLocale = canonicalPathToken ? canonicalPathLocale(canonicalPathToken) : null;
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
          where: formatFindingWhere({ section: "Document head", tag: '<link rel="canonical">' }),
          url: page.url,
          evidence: `<link rel="canonical" href="${canonicalUrl.toString()}"> on a ${pageLoc} page`,
          advice: "Canonicalize this page to its own localized URL, not another locale.",
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
        where: formatFindingWhere({ section: "Document head", tag: "<title>" }),
        url: [...byLanguage.values()][0]?.[0]?.url,
        evidence: `<title>${titles[0]}</title> is reused across sampled locales`,
        advice: "Localize the document title for each page locale.",
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
        where: formatFindingWhere({
          section: "Document head",
          tag: '<meta name="description">',
        }),
        url: [...byLanguage.values()][0]?.[0]?.url,
        evidence: `<meta name="description" content="${descriptions[0]}"> is reused across sampled locales`,
        advice: "Localize the meta description for each page locale.",
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
          where: formatFindingWhere({
            section: "Document head",
            tag: '<meta property="og:locale">',
          }),
          url: page.url,
          evidence: `<meta property="og:locale" content="${page.ogLocale}"> on a ${language} page`,
          advice: `Set og:locale to match the ${language} page locale.`,
        }),
      );
    }
  }

  return scored(score, findings);
};

const scoreSitemap: HeuristicScorer = (context) => {
  const { sitemap } = context;
  const findings: LocalisationAuditFinding[] = [];
  let score = 100;

  // Lighthouse-style: a valid, fetchable sitemap is required (not N/A when missing).
  if (sitemap.sitemapUrls.length === 0) {
    return scored(18, [
      creditFinding({
        id: "sitemap-missing",
        creditId: "sitemap",
        category: "technical",
        severity: "high",
        title: "Valid sitemap not found",
        summary:
          "No fetchable XML sitemap with URL entries was found at /sitemap.xml or via robots.txt.",
        where: formatFindingWhere({ section: "Sitemap", tag: "sitemap.xml" }),
        url: sitemap.robotsSitemapDirectives[0],
        evidence: sitemap.robotsFound
          ? sitemap.robotsSitemapDirectives.length > 0
            ? `robots.txt references ${sitemap.robotsSitemapDirectives.join(", ")}, but no sitemap returned usable <loc> entries`
            : "robots.txt was found, but it does not reference a sitemap and /sitemap.xml was missing or empty"
          : "robots.txt was missing and /sitemap.xml was missing or empty",
        advice:
          "Publish a valid XML sitemap and reference it from robots.txt with an absolute Sitemap: URL.",
        confidence: 100,
      }),
    ]);
  }

  if (!sitemap.robotsFound) {
    score -= 18;
    findings.push(
      creditFinding({
        id: "sitemap-robots-missing",
        creditId: "sitemap",
        category: "technical",
        severity: "medium",
        title: "robots.txt is missing",
        summary: "A sitemap was found, but robots.txt is missing so crawlers may not discover it.",
        where: formatFindingWhere({ section: "robots.txt", tag: "Sitemap:" }),
        url: sitemap.sitemapUrls[0],
        evidence: `Sitemap ${sitemap.sitemapUrls[0]} is reachable, but /robots.txt was not found`,
        advice:
          "Add a robots.txt that includes an absolute Sitemap: directive for the sitemap URL.",
        confidence: 95,
      }),
    );
  } else if (sitemap.robotsSitemapDirectives.length === 0) {
    score -= 28;
    findings.push(
      creditFinding({
        id: "sitemap-robots-unreferenced",
        creditId: "sitemap",
        category: "technical",
        severity: "high",
        title: "robots.txt does not reference the sitemap",
        summary:
          "A sitemap is reachable, but robots.txt does not include a Sitemap: directive pointing to it.",
        where: formatFindingWhere({ section: "robots.txt", tag: "Sitemap:" }),
        url: sitemap.sitemapUrls[0],
        evidence: `Reachable sitemap ${sitemap.sitemapUrls[0]} is not listed in robots.txt`,
        advice: `Add "Sitemap: ${sitemap.sitemapUrls[0]}" to robots.txt.`,
        confidence: 100,
      }),
    );
  }

  if (sitemap.robotsHasRelativeSitemapDirective) {
    score -= 12;
    findings.push(
      creditFinding({
        id: "sitemap-robots-relative",
        creditId: "sitemap",
        category: "technical",
        severity: "medium",
        title: "Sitemap directive uses a relative URL",
        summary: "robots.txt should declare Sitemap: with a fully qualified absolute URL.",
        where: formatFindingWhere({ section: "robots.txt", tag: "Sitemap:" }),
        url: sitemap.sitemapUrls[0],
        evidence: "At least one Sitemap: directive in robots.txt is relative rather than absolute",
        advice: "Use an absolute Sitemap: URL, for example https://example.com/sitemap.xml.",
        confidence: 98,
      }),
    );
  }

  if (context.detectedLocales.length > 1) {
    if (sitemap.localizedUrls.length === 0) {
      score -= 40;
      findings.push(
        creditFinding({
          id: "sitemap-missing-locales",
          creditId: "sitemap",
          category: "technical",
          severity: "medium",
          title: "Sitemap is missing localized URLs",
          summary: "A sitemap was found, but sampled entries do not include locale-prefixed URLs.",
          where: formatFindingWhere({ section: "Sitemap", tag: "sitemap.xml" }),
          url: sitemap.sitemapUrls[0],
          evidence: sitemap.sitemapUrls[0]
            ? `Sitemap ${sitemap.sitemapUrls[0]} has no locale-prefixed URLs in the sample`
            : "A sitemap was found, but sampled entries have no locale-prefixed URLs.",
          advice: "Include localized URLs in the sitemap for every published locale.",
          confidence: 90,
        }),
      );
    } else {
      const pathLanguagesOnSite = new Set(
        context.pages.flatMap((page) => {
          const pathLocale = pathLocaleFromUrl(page.url);
          return pathLocale ? [languageOf(pathLocale)] : [];
        }),
      );
      const languagesInSitemap = new Set(
        sitemap.localizedUrls.flatMap((url) => {
          const pathLocale = pathLocaleFromUrl(url);
          return pathLocale ? [languageOf(pathLocale)] : [];
        }),
      );
      const missingLanguages = [...pathLanguagesOnSite].filter(
        (language) => !languagesInSitemap.has(language),
      );
      if (missingLanguages.length > 0) {
        score -= Math.min(30, missingLanguages.length * 12);
        findings.push(
          creditFinding({
            id: "sitemap-incomplete-locales",
            creditId: "sitemap",
            category: "technical",
            severity: "medium",
            title: "Sitemap omits some published locales",
            summary: `Locale-prefixed pages for ${missingLanguages.join(", ")} do not appear in sampled sitemap URLs.`,
            where: formatFindingWhere({ section: "Sitemap", tag: "sitemap.xml" }),
            url: sitemap.sitemapUrls[0],
            evidence: `Sitemap locales in sample: ${[...languagesInSitemap].join(", ") || "none"}; missing: ${missingLanguages.join(", ")}`,
            advice: "Include URLs for every published locale prefix in the sitemap.",
            confidence: 88,
          }),
        );
      }
    }
  }

  return scored(score, findings);
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
            where: formatFindingWhere({
              section: "JSON-LD",
              tag: '<script type="application/ld+json">',
            }),
            url: page.url,
            evidence: `${node.type} inLanguage="${node.inLanguage}" on a ${locale} page`,
            advice: `Set JSON-LD inLanguage to the ${locale} page locale.`,
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
        where: formatFindingWhere({
          section: "JSON-LD",
          tag: '<script type="application/ld+json">',
        }),
        url: pages[0]?.url,
        evidence: `${pages[0]?.jsonLd[0]?.type ?? "JSON-LD"} is present but inLanguage is missing`,
        advice: "Set JSON-LD inLanguage to match each page locale.",
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
          where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
          url: page.url,
          evidence: clipFindingEvidence(text.match(/\$\d[\d,.]*/)?.[0] ?? "$ amount on page"),
          advice: `Use a ${language}-appropriate currency instead of unlocalized dollar amounts.`,
        }),
      );
    }

    if (language === "ar") {
      if (textHasEasternArabicDigits(text)) {
        sawPattern = true;
        mismatches += 1;
        findings.push(
          creditFinding({
            id: `formatting-arabic-numerals-${findings.length}`,
            creditId: "international-formatting",
            category: "technical",
            severity: "medium",
            title: "Arabic page uses Eastern Arabic-Indic numerals",
            summary:
              "Sampled copy uses Eastern Arabic-Indic digits; Western digits (0-9) are preferred for most product UIs.",
            where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
            url: page.url,
            evidence: clipFindingEvidence(
              text.match(/[\u0660-\u0669\u06F0-\u06F9][\u0660-\u0669\u06F0-\u06F9\s.,/-]*/)?.[0] ??
                "Eastern Arabic-Indic digits",
            ),
            advice:
              "Use Western digits (0-9) on Arabic pages unless the market explicitly requires Eastern numerals.",
            confidence: 90,
          }),
        );
      } else if (textHasWesternDigits(text)) {
        sawPattern = true;
      }

      if (textHasHijriCalendarSignals(text) && !textHasGregorianCalendarSignals(text)) {
        sawPattern = true;
        mismatches += 1;
        findings.push(
          creditFinding({
            id: `formatting-hijri-calendar-${findings.length}`,
            creditId: "international-formatting",
            category: "technical",
            severity: "medium",
            title: "Arabic page appears to use Hijri calendar dates",
            summary:
              "Hijri month names were found without clear Gregorian date signals; product UIs usually keep Gregorian calendars.",
            where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
            url: page.url,
            evidence: clipFindingEvidence(text.slice(0, 220)),
            advice:
              "Show Gregorian calendar dates on Arabic product pages (optionally offer Hijri as a secondary format).",
            confidence: 82,
          }),
        );
      } else if (textHasGregorianCalendarSignals(text)) {
        sawPattern = true;
      }
    }
  }
  if (!sawPattern) {
    return { status: "inconclusive", evidence: { reason: "no_formatting_examples" } };
  }
  return scored(mismatches > 0 ? Math.max(40, 90 - mismatches * 14) : 90, findings);
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
          where: formatFindingWhere({
            section: "Accessible name",
            tag: page.ariaLabels.includes(englishSamples[0]!) ? "[aria-label]" : "<img alt>",
          }),
          url: page.url,
          evidence: clipFindingEvidence(englishSamples[0] ?? ""),
          advice: "Translate accessible names together with the visible UI.",
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
