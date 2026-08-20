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

/** ISO 639-1 plus optional script (ISO 15924) and region (ISO 3166-1 or UN M.49). */
const LOCALE_TOKEN = "[a-z]{2}(?:-[a-z]{4})?(?:-[a-z]{2}|-[0-9]{3})?";
export const LOCALE_PREFIX = new RegExp(`^/(${LOCALE_TOKEN})(/|$)`, "i");
export const LOCALE_CODE = new RegExp(`^${LOCALE_TOKEN}$`, "i");
export const LOCALE_SUBDOMAIN = new RegExp(`^(${LOCALE_TOKEN})\\.`, "i");
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "yi"]);
const CJK_LANGUAGES = new Set(["zh", "ja", "ko"]);

/** English language display names → ISO 639-1, for focus inputs like "French". */
const ENGLISH_LANGUAGE_NAME_TO_CODE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  if (typeof Intl === "undefined" || !("DisplayNames" in Intl)) {
    return map;
  }
  const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
  for (let a = 97; a <= 122; a += 1) {
    for (let b = 97; b <= 122; b += 1) {
      const code = String.fromCharCode(a, b);
      try {
        const name = displayNames.of(code);
        if (!name) continue;
        const key = name.trim().toLowerCase();
        if (!key || key === code || LOCALE_CODE.test(key)) continue;
        if (!map.has(key)) {
          map.set(key, code);
        }
      } catch {
        // skip invalid/unsupported language codes
      }
    }
  }
  return map;
})();

/**
 * Accepts BCP 47-style codes (`fr`, `pt-BR`) or English language names (`French`).
 * Returns a lowercase canonical code, or null when the value is not a focus locale.
 */
export function resolveFocusLocaleCode(value: string): string | null {
  const normalized = normalizeLocale(value);
  if (!normalized || normalized === "x-default") {
    return null;
  }
  if (LOCALE_CODE.test(normalized)) {
    return normalized;
  }
  return ENGLISH_LANGUAGE_NAME_TO_CODE.get(normalized) ?? null;
}

/**
 * URL path prefixes that are market/region codes, not ISO 639 language tags.
 * Mapped to the BCP 47 html lang value sites should declare.
 */
const PATH_REGION_TO_HTML_LANG: Record<string, string> = {
  au: "en-AU",
  us: "en-US",
  nz: "en-NZ",
  gb: "en-GB",
  jp: "ja-JP",
  kr: "ko-KR",
  cn: "zh-CN",
  tw: "zh-TW",
  hk: "zh-HK",
  mx: "es-MX",
  in: "en-IN",
  za: "en-ZA",
  ph: "en-PH",
};

export function normalizeLocale(value: string): string {
  return value.trim().replaceAll("_", "-").toLowerCase();
}

export function languageOf(locale: string): string {
  return normalizeLocale(locale).split("-")[0] ?? "";
}

function localeRegion(locale: string): string {
  return normalizeLocale(locale).split("-").slice(1).join("-");
}

/**
 * Deprecated ISO 639-1 aliases still seen in html lang and og:locale.
 * Mapped to the current preferred language subtag.
 */
const LANGUAGE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["iw", "he"],
  ["in", "id"],
  ["ji", "yi"],
  ["jw", "jv"],
  ["mo", "ro"],
  ["tl", "fil"],
]);

/**
 * Individual ISO 639 languages → their macrolanguage.
 * `no` is Norwegian; `nb` is Bokmål and `nn` is Nynorsk. Open Graph uses
 * `nb_NO` for Norwegian, so a `/no/` page with og:locale=nb_NO is correct.
 */
const LANGUAGE_MACROLANGUAGE: ReadonlyMap<string, string> = new Map([
  ["nb", "no"],
  ["nn", "no"],
]);

function canonicalLanguage(locale: string): string {
  const language = languageOf(locale);
  return LANGUAGE_ALIASES.get(language) ?? language;
}

/**
 * Whether two locale tags refer to the same language family.
 * Matches `nb`/`nn` to macrolanguage `no`, and deprecated aliases such as
 * `iw`→`he`. Sibling individual languages (`nb` vs `nn`) do not match.
 */
export function languagesMatch(left: string, right: string): boolean {
  const leftLanguage = canonicalLanguage(left);
  const rightLanguage = canonicalLanguage(right);
  if (!leftLanguage || !rightLanguage) return false;
  if (leftLanguage === rightLanguage) return true;
  const leftMacro = LANGUAGE_MACROLANGUAGE.get(leftLanguage) ?? leftLanguage;
  const rightMacro = LANGUAGE_MACROLANGUAGE.get(rightLanguage) ?? rightLanguage;
  return leftLanguage === rightMacro || rightLanguage === leftMacro;
}

/**
 * Whether a value is a structurally valid BCP 47 language tag for `html lang`.
 * Accepts UN M.49 regions such as `es-419` (Latin America) and scripts such as `zh-Hans`.
 */
export function isWellFormedHtmlLang(value: string): boolean {
  const trimmed = value.trim().replaceAll("_", "-");
  if (!trimmed || normalizeLocale(trimmed) === "x-default") {
    return false;
  }
  const language = languageOf(trimmed);
  if (!/^[a-z]{2,3}$/.test(language)) {
    return false;
  }
  try {
    return Intl.getCanonicalLocales(trimmed).length > 0;
  } catch {
    return false;
  }
}

/** Format a normalized locale as a conventional BCP 47 tag (e.g. en-AU, es-419). */
export function formatBcp47Locale(locale: string): string {
  const normalized = normalizeLocale(locale);
  try {
    return Intl.getCanonicalLocales(normalized)[0] ?? normalized;
  } catch {
    const parts = normalized.split("-").filter(Boolean);
    const language = parts[0];
    if (!language) return normalized;
    return [
      language,
      ...parts.slice(1).map((part) => {
        if (/^\d{3}$/.test(part)) return part;
        if (part.length === 4) return `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`;
        if (part.length === 2) return part.toUpperCase();
        return part;
      }),
    ].join("-");
  }
}

/**
 * Path locale token → suggested `html lang` value.
 * Region-only prefixes like `au` map to `en-AU`, not the invalid tag `au`.
 */
export function htmlLangSuggestionForPathLocale(pathLocale: string): string {
  const normalized = normalizeLocale(pathLocale);
  if (normalized.includes("-")) {
    return formatBcp47Locale(normalized);
  }
  const regionMapped = PATH_REGION_TO_HTML_LANG[normalized];
  if (regionMapped) return regionMapped;
  return normalized;
}

/** Canonical locale signal for a URL path prefix (region paths become language-region tags). */
export function canonicalPathLocale(pathLocale: string): string {
  return normalizeLocale(htmlLangSuggestionForPathLocale(pathLocale));
}

/**
 * Whether declared html lang agrees with the URL path locale.
 * `en` matches path `/au/` (suggested `en-AU`); `fr` on `/au/` does not.
 * `nb-NO` matches path `/no/` (Norwegian Bokmål under macrolanguage `no`).
 */
export function htmlLangMatchesPathLocale(htmlLang: string, pathLocale: string): boolean {
  const html = normalizeLocale(htmlLang);
  const suggested = normalizeLocale(htmlLangSuggestionForPathLocale(pathLocale));
  if (html === suggested) return true;
  if (!languagesMatch(html, suggested)) return false;
  const htmlRegion = localeRegion(html);
  const suggestedRegion = localeRegion(suggested);
  // Bare language (or equivalent, e.g. nb vs no) matches a language-region tag.
  if (!htmlRegion || !suggestedRegion) return true;
  return htmlRegion === suggestedRegion;
}

export function isRtlLanguage(locale: string): boolean {
  return RTL_LANGUAGES.has(languageOf(locale));
}

export function isCjkLanguage(locale: string): boolean {
  return CJK_LANGUAGES.has(languageOf(locale));
}

/** Replacement / empty-box glyphs that often indicate missing font coverage ("tofu"). */
export const TOFU_GLYPH_RE = /[\uFFFD\u25A1\u25A0\u25AF□�]/u;
export const HANGUL_RE = /[\uAC00-\uD7AF]/u;
export const CJK_IDEOGRAPH_RE = /[\u4E00-\u9FFF]/u;
export const KANA_RE = /[\u3040-\u30FF]/u;

const CJK_FONT_HINT_RE =
  /noto\s*sans\s*cjk|noto\s*serif\s*cjk|source\s*han|malgun|gulim|batang|dotum|nanum|apple\s*sd\s*gothic|apple\s*gothic|hiragino|yu\s*gothic|yu\s*mincho|meiryo|ms\s*p?gothic|ms\s*p?mincho|pingfang|heiti|songti|stsong|microsoft\s*yahei|simsun|simhei|dengxian|wenquanyi|sarasa|ibm\s*plex\s*sans\s*(jp|kr|sc|tc)|pretendard|spoqa|kopub|apple\s*myungjo|noto\s*sans\s*kr|noto\s*sans\s*jp|noto\s*sans\s*sc|noto\s*sans\s*tc/i;

const WESTERN_NAME_FIELD_RE =
  /\b(first[\s_-]?name|last[\s_-]?name|given[\s_-]?name|family[\s_-]?name|surname|forename)\b/i;

export function textHasHangul(text: string): boolean {
  return HANGUL_RE.test(text);
}

export function textHasCjkScript(text: string): boolean {
  return HANGUL_RE.test(text) || CJK_IDEOGRAPH_RE.test(text) || KANA_RE.test(text);
}

export function findTofuGlyphs(text: string): string[] {
  return [...new Set(text.match(new RegExp(TOFU_GLYPH_RE.source, "gu")) ?? [])];
}

export function fontStackLooksCjkCapable(fontFamilies: string[]): boolean {
  return fontFamilies.some((family) => CJK_FONT_HINT_RE.test(family));
}

export function westernNameFields(labels: string[]): string[] {
  return labels.filter((label) => WESTERN_NAME_FIELD_RE.test(label));
}

/** Eastern Arabic-Indic (U+0660–U+0669) and Extended Arabic-Indic / Persian (U+06F0–U+06F9). */
export const EASTERN_ARABIC_DIGIT_RE = /[\u0660-\u0669\u06F0-\u06F9]/u;
export const WESTERN_DIGIT_RE = /[0-9]/u;

const HIJRI_MONTH_RE =
  /محرم|صفر|ربيع(?:\s*الأول|\s*الثاني)?|جمادى(?:\s*الأولى|\s*الآخرة)?|رجب|شعبان|رمضان|شوال|ذو\s*القعدة|ذو\s*الحجة|muharram|safar|rabi[a']?\s*(?:al-?)?awwal|rabi[a']?\s*(?:al-?)?thani|jumada|rajab|sha'?ban|ramadan|shawwal|dhul[-\s]?qi'?dah|dhul[-\s]?hijjah/iu;

const GREGORIAN_ARABIC_MONTH_RE =
  /يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر/u;

const GREGORIAN_LATIN_DATE_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(?:20\d{2}|19\d{2})\b/i;

export function textHasEasternArabicDigits(text: string): boolean {
  return EASTERN_ARABIC_DIGIT_RE.test(text);
}

export function textHasWesternDigits(text: string): boolean {
  return WESTERN_DIGIT_RE.test(text);
}

export function textHasHijriCalendarSignals(text: string): boolean {
  return HIJRI_MONTH_RE.test(text);
}

export function textHasGregorianCalendarSignals(text: string): boolean {
  return GREGORIAN_ARABIC_MONTH_RE.test(text) || GREGORIAN_LATIN_DATE_RE.test(text);
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
  const pathLocale = pathLocaleFromUrl(page.url);
  if (pathLocale) return canonicalPathLocale(pathLocale);
  return page.htmlLang ? normalizeLocale(page.htmlLang) : null;
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

const CTA_COPY_MIN_CHARS = 8;
const CTA_COPY_MAX_CHARS = 72;
const CSS_AT_RULE_RE = /@(?:keyframes|media|font-face|import|supports|layer)\b/i;
const CSS_DECLARATION_RE = /[a-z-]+\s*:\s*[^:;{}]+;/i;
const CSS_VALUE_HINT_RE = /--|px|%|rgb|hsl|#[0-9a-f]{3,8}/i;

/** Inline CSS, keyframes, or other non-copy leaked into button/anchor text. */
export function looksLikeCssOrCode(text: string): boolean {
  if (CSS_AT_RULE_RE.test(text) || /[{}]/.test(text)) {
    return true;
  }
  return CSS_DECLARATION_RE.test(text) && CSS_VALUE_HINT_RE.test(text);
}

/**
 * Whether a button or link label is short human copy that can be compared
 * across locales. Rejects CSS, URLs, and other non-CTA noise.
 */
export function isPlausibleCtaCopy(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < CTA_COPY_MIN_CHARS || trimmed.length > CTA_COPY_MAX_CHARS) {
    return false;
  }
  if (looksLikeUrlOrEmail(trimmed) || looksLikeCssOrCode(trimmed)) {
    return false;
  }
  return /\p{L}/u.test(trimmed);
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
  /** Bare language tags that appear as their own URL/subdomain market prefixes. */
  const bareLanguagesFromRouting = new Set<string>();
  /** Languages that have a language-region tag from URL/subdomain routing. */
  const languagesWithRegionFromRouting = new Set<string>();

  const add = (
    locale: string,
    source: LocalisationAuditLocaleSignal["source"],
    sampleUrl?: string,
  ) => {
    const key = normalizeLocale(locale);
    if (!key || key === "x-default" || !isWellFormedHtmlLang(key)) return;
    if (!byLocale.has(key)) {
      byLocale.set(key, { locale: key, source, sampleUrl });
    }
  };

  const noteRoutingLocale = (canonical: string) => {
    if (canonical.includes("-")) {
      languagesWithRegionFromRouting.add(languageOf(canonical));
    } else {
      bareLanguagesFromRouting.add(canonical);
    }
  };

  for (const focus of focusLocales) {
    const code = resolveFocusLocaleCode(focus);
    if (code) {
      add(code, "focus");
    }
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
      const canonical = canonicalPathLocale(pathLocale);
      add(canonical, "url_prefix", page.url);
      noteRoutingLocale(canonical);
    }
    try {
      const host = new URL(page.url).hostname;
      const hostMatch = host.match(LOCALE_SUBDOMAIN);
      if (hostMatch?.[1] && hostMatch[1].toLowerCase() !== "www") {
        const hostLocale = canonicalPathLocale(hostMatch[1]);
        add(hostLocale, "url_subdomain", page.url);
        noteRoutingLocale(hostLocale);
      }
    } catch {
      // ignore bad URLs
    }
  }

  return collapseLanguageRegionSignals(
    [...byLocale.values()],
    bareLanguagesFromRouting,
    languagesWithRegionFromRouting,
  ).toSorted((a, b) => a.locale.localeCompare(b.locale));
}

/**
 * Prefer `en-au` over bare `en` when the bare tag is only a redundant html/hreflang
 * annotation. Keep bare `en` when URL routing also has both `/en/` and a region
 * market like `/au/` (distinct markets, same language).
 */
function collapseLanguageRegionSignals(
  signals: LocalisationAuditLocaleSignal[],
  bareLanguagesFromRouting: Set<string>,
  languagesWithRegionFromRouting: Set<string>,
): LocalisationAuditLocaleSignal[] {
  const languagesWithRegion = new Set(
    signals.filter((entry) => entry.locale.includes("-")).map((entry) => languageOf(entry.locale)),
  );
  return signals.filter((entry) => {
    if (entry.locale.includes("-")) return true;
    if (!languagesWithRegion.has(entry.locale)) return true;
    return (
      bareLanguagesFromRouting.has(entry.locale) && languagesWithRegionFromRouting.has(entry.locale)
    );
  });
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

export const FINDING_EVIDENCE_MAX_CHARS = 400;

export function formatFindingWhere(input: { section: string; tag: string }): string {
  return `${input.section} · ${input.tag}`;
}

export function clipFindingEvidence(value: string, max = FINDING_EVIDENCE_MAX_CHARS): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function creditFinding(input: {
  id: string;
  creditId: string;
  category: LocalisationAuditFindingCategory;
  severity: LocalisationAuditFindingSeverity;
  title: string;
  summary: string;
  where?: string;
  url?: string;
  evidence?: string;
  advice?: string;
  confidence?: number;
}): LocalisationAuditFinding {
  return {
    id: input.id,
    creditId: input.creditId,
    category: input.category,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    where: input.where,
    url: input.url,
    evidence: input.evidence,
    advice: input.advice,
    confidence: input.confidence ?? 95,
  };
}
