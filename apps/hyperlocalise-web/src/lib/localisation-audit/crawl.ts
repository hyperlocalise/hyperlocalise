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
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import { parsePageSignals } from "./html-parse";
import type { LocalisationAuditCrawledPage } from "./types";

const USER_AGENT = "HyperlocaliseLocalisationAudit/1.0 (+https://hyperlocalise.com)";
const MAX_PAGES = 15;
const MAX_DISCOVERED_LOCALES = 5;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HIGH_VALUE_PATHS = ["/pricing", "/product", "/products", "/about", "/company", "/blog"];

const LOCALE_PREFIX = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i;
const LOCALE_CODE = /^[a-z]{2}(?:-[a-z]{2})?$/i;

const FETCH_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

function toAbsoluteUrl(base: string, href: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameHost(originHost: string, url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === originHost.replace(/^www\./, "");
  } catch {
    return false;
  }
}

type SafeFetchOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "redirect"; nextUrl: string }
  | { kind: "fail" };

type SafeFetchResult<T> = { ok: true; value: T } | { ok: false };

/**
 * Follow redirects manually so each hop is re-validated by withPublicHttpFetch.
 * Never use redirect:"follow" — undici can connect to IP-literal Location targets
 * without the DNS pin, bypassing the SSRF guard.
 *
 * One AbortController + FETCH_TIMEOUT_MS deadline covers the whole redirect chain
 * (not a fresh 12s budget per hop).
 *
 * Returns a discriminated result (not `T | null`) so Turbopack cannot DCE the
 * failure branch after await — it has been observed to strip `if (!home)` as
 * "compile-time falsy" when the helper returned null.
 */
async function fetchPublicWithSafeRedirects<T>(
  startUrl: string,
  handler: (response: Response, finalUrl: string) => Promise<T>,
): Promise<SafeFetchResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (controller.signal.aborted) {
        return { ok: false };
      }
      try {
        const outcome = await withPublicHttpFetch(
          currentUrl,
          {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: FETCH_HEADERS,
          },
          async (response): Promise<SafeFetchOutcome<T>> => {
            if (REDIRECT_STATUSES.has(response.status)) {
              const location = response.headers.get("location");
              if (!location) return { kind: "fail" };
              const nextUrl = toAbsoluteUrl(currentUrl, location);
              if (!nextUrl) return { kind: "fail" };
              return { kind: "redirect", nextUrl };
            }
            return {
              kind: "ok",
              value: await handler(response, currentUrl),
            };
          },
        );
        if (outcome.kind === "redirect") {
          currentUrl = outcome.nextUrl;
          continue;
        }
        if (outcome.kind === "ok") {
          return { ok: true, value: outcome.value };
        }
        return { ok: false };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url: string): Promise<LocalisationAuditCrawledPage | null> {
  const result = await fetchPublicWithSafeRedirects(url, async (response, finalUrl) => {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return {
        url: finalUrl,
        status: response.status,
        htmlLang: null,
        title: null,
        textSample: "",
        hreflang: [],
      };
    }

    const body = await readBoundedResponseBody(response);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(body);
    const signals = parsePageSignals(html);
    return {
      url: finalUrl,
      status: response.status,
      htmlLang: signals.htmlLang,
      title: signals.title,
      textSample: signals.textSample,
      hreflang: signals.hreflang,
    };
  });
  return result.ok ? result.value : null;
}

async function fetchPageWithAnchors(url: string): Promise<
  SafeFetchResult<{
    page: LocalisationAuditCrawledPage;
    candidateUrls: string[];
  }>
> {
  return fetchPublicWithSafeRedirects(url, async (response, finalUrl) => {
    const body = await readBoundedResponseBody(response);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(body);
    const signals = parsePageSignals(html);
    const page: LocalisationAuditCrawledPage = {
      url: finalUrl,
      status: response.status,
      htmlLang: signals.htmlLang,
      title: signals.title,
      textSample: signals.textSample,
      hreflang: signals.hreflang,
    };
    const candidateUrls = [
      ...signals.hreflang.map((entry) => toAbsoluteUrl(finalUrl, entry.href)).filter(Boolean),
      ...signals.anchors.map((anchor) => toAbsoluteUrl(finalUrl, anchor.href)).filter(Boolean),
    ] as string[];
    return { page, candidateUrls };
  });
}

function normalizeLocaleCode(value: string): string | null {
  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (normalized === "x-default" || !LOCALE_CODE.test(normalized)) {
    return null;
  }
  return normalized;
}

function localeFromPath(pathname: string): string | null {
  const match = pathname.match(LOCALE_PREFIX);
  return match ? normalizeLocaleCode(match[1]!) : null;
}

function isHighValuePath(path: string): boolean {
  return HIGH_VALUE_PATHS.some((candidate) => path === candidate || path.endsWith(candidate));
}

/**
 * Prefer focus locales, then hreflang, then locale prefixes seen on same-host
 * homepage links — capped so prefixed high-value probes stay within MAX_PAGES.
 */
function discoverLocales(input: {
  focusLocales: string[];
  hreflang: Array<{ locale: string }>;
  candidateUrls: string[];
  originHost: string;
}): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const locale = normalizeLocaleCode(raw);
    if (!locale || seen.has(locale)) {
      return;
    }
    seen.add(locale);
    ordered.push(locale);
  };

  for (const locale of input.focusLocales) {
    add(locale);
  }
  for (const entry of input.hreflang) {
    add(entry.locale);
  }
  for (const url of input.candidateUrls) {
    if (!sameHost(input.originHost, url)) {
      continue;
    }
    try {
      const locale = localeFromPath(new URL(url).pathname);
      if (locale) {
        add(locale);
      }
    } catch {
      // ignore malformed candidate URLs
    }
  }

  return ordered.slice(0, MAX_DISCOVERED_LOCALES);
}

function seedHighValuePaths(origin: string, locales: string[]): string[] {
  const seeds: string[] = [];
  for (const path of HIGH_VALUE_PATHS) {
    seeds.push(new URL(path, origin).toString());
    for (const locale of locales) {
      seeds.push(new URL(`/${locale}${path}`, origin).toString());
    }
  }
  return seeds;
}

function scoreCandidate(url: string, origin: string): number {
  try {
    const parsed = new URL(url);
    const originHost = new URL(origin).hostname;
    if (!sameHost(originHost, url)) {
      return -1;
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    if (path === "/") return 100;
    if (LOCALE_PREFIX.test(path) && path.split("/").filter(Boolean).length <= 1) return 90;
    if (isHighValuePath(path) && localeFromPath(path)) return 85;
    if (isHighValuePath(path)) return 80;
    if (LOCALE_PREFIX.test(path)) return 60;
    if (path.split("/").filter(Boolean).length <= 2) return 40;
    return 10;
  } catch {
    return -1;
  }
}

export async function crawlLocalisationAuditSample(input: {
  origin: string;
  sourceUrl: string;
  focusLocales?: string[];
}): Promise<LocalisationAuditCrawledPage[]> {
  try {
    return await crawlLocalisationAuditSampleInner(input);
  } catch {
    // Soft-fail unexpected errors (and any remaining Turbopack null-guard DCE)
    // so the workflow step does not retry forever on an empty crawl.
    return [];
  }
}

async function crawlLocalisationAuditSampleInner(input: {
  origin: string;
  sourceUrl: string;
  focusLocales?: string[];
}): Promise<LocalisationAuditCrawledPage[]> {
  const homeResult = await fetchPageWithAnchors(input.sourceUrl);
  if (homeResult.ok === false) {
    return [];
  }

  const { page: homePage, candidateUrls } = homeResult.value;
  const originHost = new URL(input.origin).hostname;
  const locales = discoverLocales({
    focusLocales: input.focusLocales ?? [],
    hreflang: homePage.hreflang,
    candidateUrls,
    originHost,
  });
  const seeded = new Set<string>([homePage.url]);
  for (const url of seedHighValuePaths(input.origin, locales)) {
    seeded.add(url);
  }
  for (const candidate of candidateUrls) {
    if (sameHost(originHost, candidate)) {
      seeded.add(candidate.split("#")[0]!);
    }
  }

  const ranked = [...seeded]
    .map((url) => ({ url, score: scoreCandidate(url, input.origin) }))
    .filter((entry) => entry.score >= 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, MAX_PAGES);

  const pages = await mapWithConcurrency(ranked, 4, async (entry) => {
    if (entry.url === homePage.url) {
      return homePage;
    }
    return fetchPage(entry.url);
  });

  return pages.filter((page): page is LocalisationAuditCrawledPage => page != null);
}
