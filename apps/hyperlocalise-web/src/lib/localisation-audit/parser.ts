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
import { createHash } from "node:crypto";

import { Parser } from "htmlparser2";

import type { DiscoveredLocaleAlternative, ExtractedPage } from "./types";

const EXCLUDED_TAGS = new Set(["script", "style", "noscript", "template", "svg"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3"]);
const CTA_CLASS_PATTERN = /(?:^|[\s_-])(button|btn|cta)(?:$|[\s_-])/i;
const MAX_VISIBLE_TEXT_LENGTH = 20_000;
const MAX_SNIPPET_LENGTH = 240;

type ElementFrame = {
  tagName: string;
  attributes: Record<string, string>;
  text: string;
};

export function sanitizeAuditExcerpt(value: string, maxLength = MAX_SNIPPET_LENGTH): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
      ? " "
      : character;
  }).join("");
  const normalized = withoutControls.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeAuditUrl(value: string, baseUrl?: string): string | null {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeLocale(value: string | undefined): string | null {
  if (!value || value.toLowerCase() === "x-default") {
    return value?.toLowerCase() === "x-default" ? "x-default" : null;
  }

  try {
    return Intl.getCanonicalLocales(value.replace("_", "-"))[0] ?? null;
  } catch {
    return null;
  }
}

function isCtaElement(tagName: string, attributes: Record<string, string>): boolean {
  return (
    tagName === "button" ||
    attributes.role?.toLowerCase() === "button" ||
    CTA_CLASS_PATTERN.test(attributes.class ?? "")
  );
}

function createFingerprint(input: Omit<ExtractedPage, "contentFingerprint">): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        htmlLang: input.htmlLang,
        title: input.title,
        description: input.description,
        headings: input.headings,
        navigation: input.navigation,
        callsToAction: input.callsToAction,
        visibleText: input.visibleText,
      }),
    )
    .digest("hex");
}

export function extractLocalisationPage(html: string, pageUrl: string): ExtractedPage {
  const normalizedPageUrl = normalizeAuditUrl(pageUrl);
  if (!normalizedPageUrl) {
    throw new Error("A valid HTTP(S) page URL is required.");
  }

  let htmlLang: string | null = null;
  let title: string | null = null;
  let description: string | null = null;
  let canonicalUrl: string | null = null;
  let excludedDepth = 0;
  let visibleText = "";
  const stack: ElementFrame[] = [];
  const headings: string[] = [];
  const navigation: string[] = [];
  const callsToAction: string[] = [];
  const alternatives: DiscoveredLocaleAlternative[] = [];

  const addAlternative = (
    localeValue: string | undefined,
    href: string | undefined,
    source: DiscoveredLocaleAlternative["source"],
  ) => {
    const locale = normalizeLocale(localeValue);
    const url = href ? normalizeAuditUrl(href, normalizedPageUrl) : null;
    if (!locale || !url || url === normalizedPageUrl) {
      return;
    }
    alternatives.push({ locale, url, source });
  };

  const parser = new Parser(
    {
      onopentag(tagName, rawAttributes) {
        const attributes = Object.fromEntries(
          Object.entries(rawAttributes).map(([key, value]) => [key.toLowerCase(), value]),
        );
        const normalizedTagName = tagName.toLowerCase();
        stack.push({ tagName: normalizedTagName, attributes, text: "" });

        if (EXCLUDED_TAGS.has(normalizedTagName)) {
          excludedDepth += 1;
        }
        if (normalizedTagName === "html") {
          htmlLang = normalizeLocale(attributes.lang);
        }
        if (normalizedTagName === "meta") {
          const metaName = (attributes.name ?? attributes.property ?? "").toLowerCase();
          if (metaName === "description" && attributes.content) {
            description = sanitizeAuditExcerpt(attributes.content, 500);
          }
        }
        if (normalizedTagName === "link") {
          const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
          if (rel.includes("canonical") && attributes.href) {
            canonicalUrl = normalizeAuditUrl(attributes.href, normalizedPageUrl);
          }
          if (rel.includes("alternate")) {
            addAlternative(attributes.hreflang, attributes.href, "hreflang");
          }
        }
        if (normalizedTagName === "a") {
          const locale = attributes.hreflang ?? attributes["data-locale"] ?? attributes.lang;
          addAlternative(locale, attributes.href, "language_link");
        }
      },
      ontext(text) {
        if (excludedDepth > 0) {
          return;
        }
        visibleText += ` ${text}`;
        for (const frame of stack) {
          frame.text += ` ${text}`;
        }
      },
      onclosetag(tagName) {
        const normalizedTagName = tagName.toLowerCase();
        const frame = stack.pop();
        if (!frame) {
          return;
        }

        if (EXCLUDED_TAGS.has(normalizedTagName)) {
          excludedDepth = Math.max(0, excludedDepth - 1);
          return;
        }

        const text = sanitizeAuditExcerpt(frame.text);
        if (normalizedTagName === "title" && text) {
          title = text;
        }
        if (HEADING_TAGS.has(normalizedTagName) && text) {
          headings.push(text);
        }
        const isInsideNavigation = stack.some(
          (ancestor) =>
            ancestor.tagName === "nav" || ancestor.attributes.role?.toLowerCase() === "navigation",
        );
        if (
          text &&
          (normalizedTagName === "a" || normalizedTagName === "button") &&
          isInsideNavigation
        ) {
          navigation.push(text);
        }
        if (text && isCtaElement(normalizedTagName, frame.attributes)) {
          callsToAction.push(text);
        }
      },
    },
    { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true },
  );

  parser.write(html);
  parser.end();

  const uniqueAlternatives = Array.from(
    new Map(
      alternatives.map((alternative) => [`${alternative.locale}:${alternative.url}`, alternative]),
    ).values(),
  );
  const extractedWithoutFingerprint = {
    url: normalizedPageUrl,
    htmlLang,
    title,
    description,
    canonicalUrl,
    alternateLinks: uniqueAlternatives,
    headings: headings.slice(0, 20),
    navigation: Array.from(new Set(navigation)).slice(0, 30),
    callsToAction: Array.from(new Set(callsToAction)).slice(0, 20),
    visibleText: sanitizeAuditExcerpt(visibleText, MAX_VISIBLE_TEXT_LENGTH),
  };

  return {
    ...extractedWithoutFingerprint,
    contentFingerprint: createFingerprint(extractedWithoutFingerprint),
  };
}

export function discoverLocaleAlternatives(
  page: ExtractedPage,
  maxAlternatives = 5,
): DiscoveredLocaleAlternative[] {
  const byUrl = new Map<string, DiscoveredLocaleAlternative>();
  for (const alternative of page.alternateLinks) {
    if (!byUrl.has(alternative.url)) {
      byUrl.set(alternative.url, alternative);
    }
    if (byUrl.size >= maxAlternatives) {
      break;
    }
  }
  return Array.from(byUrl.values());
}
