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
import type {
  LocalisationAuditCrawledPage,
  LocalisationAuditFinding,
  LocalisationAuditLocaleSignal,
} from "./types";

const LOCALE_PREFIX = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i;

function normalizeLocale(value: string): string {
  return value.trim().replaceAll("_", "-").toLowerCase();
}

function detectLocales(
  pages: LocalisationAuditCrawledPage[],
  focusLocales: string[],
): LocalisationAuditLocaleSignal[] {
  const byLocale = new Map<string, LocalisationAuditLocaleSignal>();

  const add = (
    locale: string,
    source: LocalisationAuditLocaleSignal["source"],
    sampleUrl?: string,
  ) => {
    const key = normalizeLocale(locale);
    if (!key || key === "x-default") return;
    if (!byLocale.has(key)) {
      byLocale.set(key, { locale: key, source, sampleUrl });
    }
  };

  for (const focus of focusLocales) {
    add(focus, "focus");
  }

  for (const page of pages) {
    if (page.htmlLang) {
      add(page.htmlLang, "html_lang", page.url);
    }
    for (const entry of page.hreflang) {
      add(entry.locale, "hreflang", entry.href);
    }
    try {
      const path = new URL(page.url).pathname;
      const match = path.match(LOCALE_PREFIX);
      if (match?.[1]) {
        add(match[1], "url_prefix", page.url);
      }
      const host = new URL(page.url).hostname;
      const hostMatch = host.match(/^([a-z]{2}(?:-[a-z]{2})?)\./i);
      if (hostMatch?.[1] && hostMatch[1].toLowerCase() !== "www") {
        add(hostMatch[1], "url_subdomain", page.url);
      }
    } catch {
      // ignore bad URLs
    }
  }

  return [...byLocale.values()].toSorted((a, b) => a.locale.localeCompare(b.locale));
}

function looksPrimarilyEnglish(text: string): boolean {
  const sample = text.slice(0, 800);
  if (sample.length < 40) return false;
  let latin = 0;
  let nonAscii = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      latin += 1;
    } else if (code > 127) {
      nonAscii += 1;
    }
  }
  return latin > 20 && latin > nonAscii * 3;
}

export function runTechnicalLocalisationChecks(input: {
  pages: LocalisationAuditCrawledPage[];
  focusLocales: string[];
}): {
  detectedLocales: LocalisationAuditLocaleSignal[];
  findings: LocalisationAuditFinding[];
} {
  const findings: LocalisationAuditFinding[] = [];
  const detectedLocales = detectLocales(input.pages, input.focusLocales);
  const home = input.pages[0];

  if (!home) {
    findings.push({
      id: "no-pages",
      category: "technical",
      severity: "critical",
      title: "Could not crawl the site",
      summary: "The audit could not fetch any HTML pages from this domain.",
    });
    return { detectedLocales, findings };
  }

  const failed = input.pages.filter((page) => page.status < 200 || page.status >= 400);
  for (const page of failed.slice(0, 5)) {
    findings.push({
      id: `http-${page.status}-${findings.length}`,
      category: "technical",
      severity: page.status === 404 ? "critical" : "warning",
      title: `Page returned HTTP ${page.status}`,
      summary: "A sampled localisation URL did not return a successful HTML response.",
      url: page.url,
    });
  }

  const hasHreflang = input.pages.some((page) => page.hreflang.length > 0);
  if (detectedLocales.length > 1 && !hasHreflang) {
    findings.push({
      id: "missing-hreflang",
      category: "technical",
      severity: "warning",
      title: "No hreflang annotations found",
      summary:
        "Multiple locale signals were detected, but sampled pages did not expose hreflang alternate links.",
      url: home.url,
    });
  }

  for (const page of input.pages) {
    for (const entry of page.hreflang) {
      if (entry.locale.toLowerCase() === "x-default") continue;
      const broken = input.pages.find(
        (candidate) =>
          candidate.url === entry.href && (candidate.status < 200 || candidate.status >= 400),
      );
      if (broken) {
        findings.push({
          id: `hreflang-broken-${findings.length}`,
          category: "technical",
          severity: "critical",
          title: `hreflang target returns HTTP ${broken.status}`,
          summary: `Alternate link for ${entry.locale} points to a failing URL.`,
          url: entry.href,
          evidence: entry.locale,
        });
      }
    }
  }

  for (const page of input.pages) {
    const pathLocale = page.url.match(LOCALE_PREFIX)?.[1];
    if (!pathLocale || !page.htmlLang) continue;
    if (normalizeLocale(pathLocale) !== normalizeLocale(page.htmlLang)) {
      findings.push({
        id: `lang-mismatch-${findings.length}`,
        category: "technical",
        severity: "warning",
        title: "URL locale and html lang disagree",
        summary: `Path suggests ${pathLocale} but html lang is ${page.htmlLang}.`,
        url: page.url,
        evidence: `path=${pathLocale}; lang=${page.htmlLang}`,
      });
    }
  }

  for (const page of input.pages) {
    const pathLocale = page.url.match(LOCALE_PREFIX)?.[1];
    if (!pathLocale) continue;
    if (normalizeLocale(pathLocale).startsWith("en")) continue;
    if (page.textSample && looksPrimarilyEnglish(page.textSample)) {
      findings.push({
        id: `untranslated-${findings.length}`,
        category: "linguistic",
        severity: "critical",
        title: "Locale URL still looks English",
        summary: `Content on a ${pathLocale} URL appears primarily English in the sampled text.`,
        url: page.url,
        evidence: page.textSample.slice(0, 180),
      });
    }
  }

  if (detectedLocales.length <= 1) {
    findings.push({
      id: "single-locale",
      category: "technical",
      severity: "info",
      title: "Only one locale signal detected",
      summary:
        "The sample found little evidence of multi-locale routing (hreflang, locale prefixes, or html lang variety).",
      url: home.url,
    });
  }

  return { detectedLocales, findings };
}
