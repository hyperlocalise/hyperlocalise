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
import { Parser } from "htmlparser2";

import type {
  LocalisationAuditAltText,
  LocalisationAuditCrawledPage,
  LocalisationAuditJsonLd,
} from "./types";

export type ParsedPageSignals = {
  htmlLang: string | null;
  title: string | null;
  textSample: string;
  hreflang: Array<{ locale: string; href: string }>;
  anchors: Array<{ href: string; text: string }>;
  canonical: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogLocale: string | null;
  iconHrefs: string[];
  dir: string | null;
  jsonLd: LocalisationAuditJsonLd[];
  ariaLabels: string[];
  altTexts: LocalisationAuditAltText[];
  buttons: string[];
  headings: string[];
  fontFamilies: string[];
  wordBreakValues: string[];
  lineBreakValues: string[];
  directionValues: string[];
  physicalHorizontalCss: string[];
  logicalHorizontalCss: string[];
  formFieldLabels: string[];
};

const MAX_TEXT_SAMPLE = 4_000;
const MAX_ANCHORS = 80;
const MAX_ARIA_LABELS = 40;
const MAX_ALT_TEXTS = 40;
const MAX_BUTTONS = 40;
const MAX_HEADINGS = 40;
const MAX_JSON_LD = 8;
const MAX_FONT_FAMILIES = 12;
const MAX_WORD_BREAK_VALUES = 8;
const MAX_LINE_BREAK_VALUES = 8;
const MAX_DIRECTION_VALUES = 8;
const MAX_HORIZONTAL_CSS = 12;
const MAX_FORM_FIELD_LABELS = 40;
const MAX_ICON_HREFS = 8;

const FONT_FAMILY_RE = /font-family\s*:\s*([^;}{]+)/gi;
const WORD_BREAK_RE = /word-break\s*:\s*([^;}{]+)/gi;
const LINE_BREAK_RE = /line-break\s*:\s*([^;}{]+)/gi;
const DIRECTION_RE = /(?:^|[;{\s])direction\s*:\s*([^;}{]+)/gi;
const PHYSICAL_HORIZONTAL_RE =
  /(?:float\s*:\s*(?:left|right)|(?:margin|padding)-(?:left|right)\s*:\s*[^;}{]+|(?:^|[;{\s])(?:left|right)\s*:\s*[^;}{]+|text-align\s*:\s*(?:left|right))/gi;
const LOGICAL_HORIZONTAL_RE =
  /(?:margin|padding|inset)-inline(?:-start|-end)?\s*:\s*[^;}{]+|text-align\s*:\s*(?:start|end)|inline-(?:start|end)\s*:\s*[^;}{]+/gi;

function pushUnique(list: string[], value: string, max: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || list.includes(trimmed) || list.length >= max) {
    return;
  }
  list.push(trimmed);
}

function collectCssProperty(css: string, pattern: RegExp, values: string[], max: number) {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(css);
  while (match) {
    const value = match[1]?.trim().toLowerCase();
    if (value) {
      pushUnique(values, value, max);
    }
    match = pattern.exec(css);
  }
}

function collectCssSnippets(css: string, pattern: RegExp, values: string[], max: number) {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(css);
  while (match) {
    pushUnique(values, match[0]!.replace(/\s+/g, " ").trim().toLowerCase(), max);
    match = pattern.exec(css);
  }
}

function collectFontFamilies(css: string, fontFamilies: string[]) {
  FONT_FAMILY_RE.lastIndex = 0;
  let match: RegExpExecArray | null = FONT_FAMILY_RE.exec(css);
  while (match) {
    const family = match[1]?.split(",")[0]?.replaceAll(/['"]/g, "").trim();
    if (family) {
      pushUnique(fontFamilies, family, MAX_FONT_FAMILIES);
    }
    match = FONT_FAMILY_RE.exec(css);
  }
}

function collectCssSignals(
  css: string,
  fontFamilies: string[],
  wordBreakValues: string[],
  lineBreakValues: string[],
  directionValues: string[],
  physicalHorizontalCss: string[],
  logicalHorizontalCss: string[],
) {
  collectFontFamilies(css, fontFamilies);
  collectCssProperty(css, WORD_BREAK_RE, wordBreakValues, MAX_WORD_BREAK_VALUES);
  collectCssProperty(css, LINE_BREAK_RE, lineBreakValues, MAX_LINE_BREAK_VALUES);
  collectCssProperty(css, DIRECTION_RE, directionValues, MAX_DIRECTION_VALUES);
  collectCssSnippets(css, PHYSICAL_HORIZONTAL_RE, physicalHorizontalCss, MAX_HORIZONTAL_CSS);
  collectCssSnippets(css, LOGICAL_HORIZONTAL_RE, logicalHorizontalCss, MAX_HORIZONTAL_CSS);
}

function pushFormFieldLabel(labels: string[], ...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    pushUnique(labels, candidate, MAX_FORM_FIELD_LABELS);
  }
}

function jsonLdType(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string").join(",");
  }
  return "Unknown";
}

function jsonLdLanguage(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseJsonLd(raw: string): LocalisationAuditJsonLd[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    let nodes: unknown[] = [];
    if (Array.isArray(parsed)) {
      nodes = parsed;
    } else if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      nodes = Array.isArray(record["@graph"]) ? record["@graph"] : [parsed];
    }
    const results: LocalisationAuditJsonLd[] = [];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      results.push({
        type: jsonLdType(record["@type"]),
        inLanguage: jsonLdLanguage(record.inLanguage ?? record["inLanguage"]),
      });
      if (results.length >= MAX_JSON_LD) break;
    }
    return results;
  } catch {
    return [];
  }
}

export function parsePageSignals(html: string): ParsedPageSignals {
  let htmlLang: string | null = null;
  let title: string | null = null;
  let inTitle = false;
  let titleBuffer = "";
  let inScriptOrStyle = false;
  let inJsonLd = false;
  let jsonLdBuffer = "";
  let inStyle = false;
  let styleBuffer = "";
  let headingTag: "h1" | "h2" | "h3" | null = null;
  let headingBuffer = "";
  let inButton = false;
  let buttonBuffer = "";
  const textChunks: string[] = [];
  const hreflang: Array<{ locale: string; href: string }> = [];
  const anchors: Array<{ href: string; text: string }> = [];
  let currentAnchor: { href: string; textParts: string[] } | null = null;
  let canonical: string | null = null;
  let metaDescription: string | null = null;
  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogImage: string | null = null;
  let ogLocale: string | null = null;
  const iconHrefs: string[] = [];
  let dir: string | null = null;
  const jsonLd: LocalisationAuditJsonLd[] = [];
  const ariaLabels: string[] = [];
  const altTexts: LocalisationAuditAltText[] = [];
  const buttons: string[] = [];
  const headings: string[] = [];
  const fontFamilies: string[] = [];
  const wordBreakValues: string[] = [];
  const lineBreakValues: string[] = [];
  const directionValues: string[] = [];
  const physicalHorizontalCss: string[] = [];
  const logicalHorizontalCss: string[] = [];
  const formFieldLabels: string[] = [];
  let inLabel = false;
  let labelBuffer = "";

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const tag = name.toLowerCase();
        if (tag === "html") {
          if (attributes.lang) {
            htmlLang = attributes.lang.trim();
          }
          if (attributes.dir) {
            dir = attributes.dir.trim().toLowerCase();
          }
        }
        if (tag === "body" && attributes.dir && !dir) {
          dir = attributes.dir.trim().toLowerCase();
        }
        if (attributes["aria-label"]) {
          pushUnique(ariaLabels, attributes["aria-label"], MAX_ARIA_LABELS);
        }
        if (attributes.style) {
          collectCssSignals(
            attributes.style,
            fontFamilies,
            wordBreakValues,
            lineBreakValues,
            directionValues,
            physicalHorizontalCss,
            logicalHorizontalCss,
          );
        }
        if (tag === "script") {
          const type = (attributes.type ?? "").toLowerCase();
          if (type === "application/ld+json") {
            inJsonLd = true;
            jsonLdBuffer = "";
          } else {
            inScriptOrStyle = true;
          }
        }
        if (tag === "style") {
          inScriptOrStyle = true;
          inStyle = true;
          styleBuffer = "";
        }
        if (tag === "noscript") {
          inScriptOrStyle = true;
        }
        if (tag === "title") {
          inTitle = true;
          titleBuffer = "";
        }
        if (tag === "link") {
          const rel = (attributes.rel ?? "").toLowerCase();
          const relTokens = rel.split(/\s+/);
          if (relTokens.includes("alternate") && attributes.hreflang && attributes.href) {
            hreflang.push({
              locale: attributes.hreflang.trim(),
              href: attributes.href.trim(),
            });
          }
          if (relTokens.includes("canonical") && attributes.href && !canonical) {
            canonical = attributes.href.trim();
          }
          const isIcon =
            relTokens.includes("icon") ||
            relTokens.includes("shortcut") ||
            relTokens.includes("apple-touch-icon") ||
            relTokens.includes("apple-touch-icon-precomposed");
          if (isIcon && attributes.href) {
            pushUnique(iconHrefs, attributes.href.trim(), MAX_ICON_HREFS);
          }
        }
        if (tag === "meta") {
          const key = (attributes.name ?? attributes.property ?? "").toLowerCase();
          const content = (attributes.content ?? "").trim();
          if (!content) {
            return;
          }
          if (key === "description" && !metaDescription) {
            metaDescription = content;
          }
          if (key === "og:title" && !ogTitle) {
            ogTitle = content;
          }
          if (key === "og:description" && !ogDescription) {
            ogDescription = content;
          }
          if (key === "og:image" && !ogImage) {
            ogImage = content;
          }
          if (key === "og:locale" && !ogLocale) {
            ogLocale = content;
          }
        }
        if (tag === "img" && altTexts.length < MAX_ALT_TEXTS) {
          const alt = (attributes.alt ?? "").replace(/\s+/g, " ").trim();
          if (alt) {
            altTexts.push({ alt, src: (attributes.src ?? "").trim() });
          }
        }
        if (tag === "a" && attributes.href && anchors.length < MAX_ANCHORS) {
          currentAnchor = { href: attributes.href.trim(), textParts: [] };
        }
        if (tag === "button") {
          inButton = true;
          buttonBuffer = "";
        }
        if (
          tag === "input" &&
          /^(submit|button)$/i.test(attributes.type ?? "") &&
          attributes.value
        ) {
          pushUnique(buttons, attributes.value, MAX_BUTTONS);
        }
        if (tag === "label") {
          inLabel = true;
          labelBuffer = "";
        }
        if (tag === "input" || tag === "textarea" || tag === "select") {
          pushFormFieldLabel(
            formFieldLabels,
            attributes.placeholder,
            attributes.name,
            attributes["aria-label"],
            attributes.autocomplete,
            attributes.id,
          );
        }
        if (tag === "h1" || tag === "h2" || tag === "h3") {
          headingTag = tag;
          headingBuffer = "";
        }
      },
      ontext(text) {
        if (inTitle) {
          titleBuffer += text;
        }
        if (inJsonLd) {
          jsonLdBuffer += text;
        }
        if (inStyle) {
          styleBuffer += text;
        }
        if (currentAnchor) {
          currentAnchor.textParts.push(text);
        }
        if (inButton) {
          buttonBuffer += text;
        }
        if (inLabel) {
          labelBuffer += text;
        }
        if (headingTag) {
          headingBuffer += text;
        }
        if (!inScriptOrStyle && !inTitle && !inJsonLd) {
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned) {
            textChunks.push(cleaned);
          }
        }
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (tag === "script") {
          if (inJsonLd) {
            if (jsonLd.length < MAX_JSON_LD) {
              jsonLd.push(...parseJsonLd(jsonLdBuffer).slice(0, MAX_JSON_LD - jsonLd.length));
            }
            inJsonLd = false;
            jsonLdBuffer = "";
          }
          inScriptOrStyle = false;
        }
        if (tag === "style") {
          collectCssSignals(
            styleBuffer,
            fontFamilies,
            wordBreakValues,
            lineBreakValues,
            directionValues,
            physicalHorizontalCss,
            logicalHorizontalCss,
          );
          inStyle = false;
          styleBuffer = "";
          inScriptOrStyle = false;
        }
        if (tag === "noscript") {
          inScriptOrStyle = false;
        }
        if (tag === "title") {
          inTitle = false;
          title = titleBuffer.replace(/\s+/g, " ").trim() || null;
        }
        if (tag === "a" && currentAnchor) {
          anchors.push({
            href: currentAnchor.href,
            text: currentAnchor.textParts.join(" ").replace(/\s+/g, " ").trim(),
          });
          currentAnchor = null;
        }
        if (tag === "button") {
          pushUnique(buttons, buttonBuffer, MAX_BUTTONS);
          inButton = false;
          buttonBuffer = "";
        }
        if (tag === "label") {
          pushFormFieldLabel(formFieldLabels, labelBuffer);
          inLabel = false;
          labelBuffer = "";
        }
        if (tag === headingTag) {
          pushUnique(headings, headingBuffer, MAX_HEADINGS);
          headingTag = null;
          headingBuffer = "";
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  parser.end();

  let textSample = textChunks.join(" ");
  if (textSample.length > MAX_TEXT_SAMPLE) {
    textSample = `${textSample.slice(0, MAX_TEXT_SAMPLE)}…`;
  }

  return {
    htmlLang,
    title,
    textSample,
    hreflang,
    anchors,
    canonical,
    metaDescription,
    ogTitle,
    ogDescription,
    ogImage,
    ogLocale,
    iconHrefs,
    dir,
    jsonLd,
    ariaLabels,
    altTexts,
    buttons,
    headings,
    fontFamilies,
    wordBreakValues,
    lineBreakValues,
    directionValues,
    physicalHorizontalCss,
    logicalHorizontalCss,
    formFieldLabels,
  };
}

export function crawledPageFromSignals(input: {
  url: string;
  status: number;
  signals: ParsedPageSignals;
}): LocalisationAuditCrawledPage {
  return {
    url: input.url,
    status: input.status,
    htmlLang: input.signals.htmlLang,
    title: input.signals.title,
    textSample: input.signals.textSample,
    hreflang: input.signals.hreflang,
    canonical: input.signals.canonical,
    metaDescription: input.signals.metaDescription,
    ogTitle: input.signals.ogTitle,
    ogDescription: input.signals.ogDescription,
    ogImage: input.signals.ogImage,
    ogLocale: input.signals.ogLocale,
    iconHrefs: input.signals.iconHrefs,
    dir: input.signals.dir,
    jsonLd: input.signals.jsonLd,
    ariaLabels: input.signals.ariaLabels,
    altTexts: input.signals.altTexts,
    buttons: input.signals.buttons,
    headings: input.signals.headings,
    fontFamilies: input.signals.fontFamilies,
    wordBreakValues: input.signals.wordBreakValues,
    lineBreakValues: input.signals.lineBreakValues,
    directionValues: input.signals.directionValues,
    physicalHorizontalCss: input.signals.physicalHorizontalCss,
    logicalHorizontalCss: input.signals.logicalHorizontalCss,
    formFieldLabels: input.signals.formFieldLabels,
    anchors: input.signals.anchors,
  };
}

export function emptyParsedPage(url: string, status: number): LocalisationAuditCrawledPage {
  return crawledPageFromSignals({
    url,
    status,
    signals: {
      htmlLang: null,
      title: null,
      textSample: "",
      hreflang: [],
      anchors: [],
      canonical: null,
      metaDescription: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogLocale: null,
      iconHrefs: [],
      dir: null,
      jsonLd: [],
      ariaLabels: [],
      altTexts: [],
      buttons: [],
      headings: [],
      fontFamilies: [],
      wordBreakValues: [],
      lineBreakValues: [],
      directionValues: [],
      physicalHorizontalCss: [],
      logicalHorizontalCss: [],
      formFieldLabels: [],
    },
  });
}
