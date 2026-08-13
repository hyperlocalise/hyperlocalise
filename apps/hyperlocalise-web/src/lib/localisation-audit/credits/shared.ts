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
  LocalisationAuditFindingCategory,
  LocalisationAuditFindingSeverity,
  LocalisationAuditLocaleSignal,
} from "../types";

export const LOCALE_PREFIX = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i;
export const LOCALE_CODE = /^[a-z]{2}(?:-[a-z]{2})?$/i;
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "yi"]);
const CJK_LANGUAGES = new Set(["zh", "ja", "ko"]);

export function normalizeLocale(value: string): string {
  return value.trim().replaceAll("_", "-").toLowerCase();
}

export function languageOf(locale: string): string {
  return normalizeLocale(locale).split("-")[0] ?? "";
}

export function isRtlLanguage(locale: string): boolean {
  return RTL_LANGUAGES.has(languageOf(locale));
}

export function isCjkLanguage(locale: string): boolean {
  return CJK_LANGUAGES.has(languageOf(locale));
}

export function isLatinScriptLanguage(locale: string): boolean {
  const language = languageOf(locale);
  return (
    !isRtlLanguage(language) &&
    !isCjkLanguage(language) &&
    language !== "ru" &&
    language !== "uk" &&
    language !== "bg" &&
    language !== "el" &&
    language !== "th"
  );
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function pathLocaleFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(LOCALE_PREFIX);
    return match?.[1] ? normalizeLocale(match[1]) : null;
  } catch {
    return null;
  }
}

export function pageLocale(page: LocalisationAuditCrawledPage): string | null {
  return pathLocaleFromUrl(page.url) ?? (page.htmlLang ? normalizeLocale(page.htmlLang) : null);
}

export function pathWithoutLocale(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    return pathname.replace(LOCALE_PREFIX, "/").replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

export function looksLikeUrlOrEmail(text: string): boolean {
  return /https?:\/\/|www\.|@[\w.-]+\.\w{2,}/i.test(text);
}

export function looksPrimarilyEnglish(text: string): boolean {
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

export type DominantScript = "latin" | "cjk" | "arabic" | "cyrillic" | "thai" | "hebrew" | "other";

export function dominantScript(text: string): DominantScript {
  const sample = text.slice(0, 800);
  const counts: Record<DominantScript, number> = {
    latin: 0,
    cjk: 0,
    arabic: 0,
    cyrillic: 0,
    thai: 0,
    hebrew: 0,
    other: 0,
  };
  for (const char of sample) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      counts.latin += 1;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      counts.cjk += 1;
    } else if (code >= 0x3040 && code <= 0x30ff) {
      counts.cjk += 1;
    } else if (code >= 0xac00 && code <= 0xd7af) {
      counts.cjk += 1;
    } else if (code >= 0x0600 && code <= 0x06ff) {
      counts.arabic += 1;
    } else if (code >= 0x0590 && code <= 0x05ff) {
      counts.hebrew += 1;
    } else if (code >= 0x0400 && code <= 0x04ff) {
      counts.cyrillic += 1;
    } else if (code >= 0x0e00 && code <= 0x0e7f) {
      counts.thai += 1;
    }
  }
  return (
    (Object.entries(counts) as Array<[DominantScript, number]>).toSorted(
      (a, b) => b[1] - a[1],
    )[0]?.[0] ?? "other"
  );
}

export function detectLocales(
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
    if (!key || key === "x-default" || !LOCALE_CODE.test(key)) return;
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
    const pathLocale = pathLocaleFromUrl(page.url);
    if (pathLocale) {
      add(pathLocale, "url_prefix", page.url);
    }
    try {
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

export function groupPagesByLanguage(
  pages: LocalisationAuditCrawledPage[],
): Map<string, LocalisationAuditCrawledPage[]> {
  const groups = new Map<string, LocalisationAuditCrawledPage[]>();
  for (const page of pages) {
    const locale = pageLocale(page);
    if (!locale) continue;
    const language = languageOf(locale);
    const list = groups.get(language) ?? [];
    list.push(page);
    groups.set(language, list);
  }
  return groups;
}

export function sourceLanguage(detectedLocales: LocalisationAuditLocaleSignal[]): string {
  const locales = detectedLocales.map((entry) => languageOf(entry.locale));
  if (locales.includes("en")) return "en";
  return locales[0] ?? "en";
}

export function creditFinding(input: {
  id: string;
  creditId: string;
  category: LocalisationAuditFindingCategory;
  severity: LocalisationAuditFindingSeverity;
  title: string;
  summary: string;
  url?: string;
  evidence?: string;
  confidence?: number;
}): LocalisationAuditFinding {
  return {
    id: input.id,
    creditId: input.creditId,
    category: input.category,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    url: input.url,
    evidence: input.evidence,
    confidence: input.confidence ?? 95,
  };
}
