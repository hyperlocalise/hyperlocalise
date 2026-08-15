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

import type { CrawlLocalisationAuditSampleOptions, HtmlPageRenderer } from "./crawl-renderer";
import { resolveFocusLocaleCode } from "./credits/shared";
import { crawledPageFromSignals, parsePageSignals } from "./html-parse";
import { AuditBrowserSetupError } from "./sandbox-browser-error";
import type {
  LocalisationAuditCrawledPage,
  LocalisationAuditCrawlResult,
  LocalisationAuditSitemapSignal,
} from "./types";
import { EMPTY_SITEMAP_SIGNAL } from "./types";

export type {
  CrawlLocalisationAuditSampleOptions,
  HtmlPageRenderer,
  RenderedHtmlPage,
} from "./crawl-renderer";

const USER_AGENT = "HyperlocaliseLocalisationAudit/1.0 (+https://hyperlocalise.com)";
const MAX_PAGES = 15;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const LOCALE_PREFIX = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i;
const LOCALE_CODE = /^[a-z]{2}(?:-[a-z]{2})?$/i;

const FETCH_TEXT_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/plain,application/xml,text/xml,application/xhtml+xml;q=0.9,*/*;q=0.1",
};

const MAX_SITEMAP_URLS = 50;
const MAX_NESTED_SITEMAPS = 3;

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
 * Used for robots.txt and sitemaps only — HTML pages render in Playwright.
 */
async function fetchPublicWithSafeRedirects<T>(
  startUrl: string,
  handler: (response: Response, finalUrl: string) => Promise<T>,
  headers: Record<string, string> = FETCH_TEXT_HEADERS,
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
            headers,
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

async function fetchText(url: string): Promise<string | null> {
  const result = await fetchPublicWithSafeRedirects(url, async (response) => {
    if (response.status < 200 || response.status >= 400) {
      return null;
    }
    const body = await readBoundedResponseBody(response);
    return new TextDecoder("utf-8", { fatal: false }).decode(body);
  });
  return result.ok ? result.value : null;
}

function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function parseRobotsSitemaps(robots: string): string[] {
  const urls: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (match?.[1]) {
      urls.push(match[1]);
    }
  }
  return urls;
}

async function fetchSitemapSignals(origin: string): Promise<LocalisationAuditSitemapSignal> {
  const originHost = new URL(origin).hostname;
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const robots = await fetchText(robotsUrl);
  const robotsFound = robots != null;
  const sitemapUrls = new Set<string>();
  const robotsSitemapDirectives: string[] = [];
  let robotsHasRelativeSitemapDirective = false;
  if (robots) {
    for (const raw of parseRobotsSitemaps(robots)) {
      if (!/^https?:\/\//i.test(raw.trim())) {
        robotsHasRelativeSitemapDirective = true;
      }
      const absolute = toAbsoluteUrl(origin, raw);
      if (absolute) {
        robotsSitemapDirectives.push(absolute);
        sitemapUrls.add(absolute);
      }
    }
  }
  sitemapUrls.add(new URL("/sitemap.xml", origin).toString());

  const localizedUrls: string[] = [];
  const nestedQueue = [...sitemapUrls];
  const fetchedSitemaps = new Set<string>();
  while (nestedQueue.length > 0 && fetchedSitemaps.size < MAX_NESTED_SITEMAPS) {
    const sitemapUrl = nestedQueue.shift();
    if (!sitemapUrl || fetchedSitemaps.has(sitemapUrl)) {
      continue;
    }
    fetchedSitemaps.add(sitemapUrl);
    const xml = await fetchText(sitemapUrl);
    if (!xml || !xml.includes("<loc")) {
      sitemapUrls.delete(sitemapUrl);
      continue;
    }
    const locs = parseSitemapLocs(xml);
    const looksLikeIndex = /<sitemapindex/i.test(xml);
    for (const loc of locs) {
      const absolute = toAbsoluteUrl(sitemapUrl, loc);
      if (!absolute || !sameHost(originHost, absolute)) {
        continue;
      }
      if (looksLikeIndex && nestedQueue.length + fetchedSitemaps.size < MAX_NESTED_SITEMAPS) {
        nestedQueue.push(absolute);
        sitemapUrls.add(absolute);
        continue;
      }
      try {
        if (localeFromPath(new URL(absolute).pathname) && localizedUrls.length < MAX_SITEMAP_URLS) {
          localizedUrls.push(absolute);
        }
      } catch {
        // ignore malformed loc
      }
    }
  }

  return {
    robotsFound,
    robotsSitemapDirectives,
    robotsHasRelativeSitemapDirective,
    sitemapUrls: [...sitemapUrls],
    localizedUrls,
  };
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

function seedFocusLocaleRoots(origin: string, focusLocales: string[]): string[] {
  const urls: string[] = [];
  for (const raw of focusLocales) {
    const locale = resolveFocusLocaleCode(raw);
    if (!locale) continue;
    try {
      urls.push(new URL(`/${locale}`, origin).toString());
    } catch {
      // ignore malformed origin or locale path
    }
  }
  return urls;
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
    if (LOCALE_PREFIX.test(path)) return 60;
    if (path.split("/").filter(Boolean).length <= 2) return 40;
    return 10;
  } catch {
    return -1;
  }
}

function pageFromRendered(html: string, url: string, status: number): LocalisationAuditCrawledPage {
  return crawledPageFromSignals({
    url,
    status,
    signals: parsePageSignals(html),
  });
}

async function defaultCreateRenderer(): Promise<HtmlPageRenderer> {
  const { createAuditBrowserSession } = await import("./sandbox-browser");
  return createAuditBrowserSession();
}

export async function crawlLocalisationAuditSample(
  input: {
    origin: string;
    sourceUrl: string;
    focusLocales?: string[];
  },
  options?: CrawlLocalisationAuditSampleOptions,
): Promise<LocalisationAuditCrawlResult> {
  try {
    return await crawlLocalisationAuditSampleInner(input, options);
  } catch (error) {
    if (error instanceof AuditBrowserSetupError) {
      throw error;
    }
    return { pages: [], sitemap: EMPTY_SITEMAP_SIGNAL };
  }
}

async function crawlLocalisationAuditSampleInner(
  input: {
    origin: string;
    sourceUrl: string;
    focusLocales?: string[];
  },
  options?: CrawlLocalisationAuditSampleOptions,
): Promise<LocalisationAuditCrawlResult> {
  const createRenderer = options?.createRenderer ?? defaultCreateRenderer;
  const renderer = await createRenderer();
  try {
    const homeRendered = (await renderer.render([input.sourceUrl]))[0];
    if (!homeRendered) {
      return { pages: [], sitemap: EMPTY_SITEMAP_SIGNAL };
    }

    const homePage = pageFromRendered(homeRendered.html, homeRendered.url, homeRendered.status);
    const signals = parsePageSignals(homeRendered.html);
    const originHost = new URL(input.origin).hostname;
    const seeded = new Set<string>([homePage.url]);
    const candidateUrls = [
      ...signals.hreflang
        .map((entry) => toAbsoluteUrl(homeRendered.url, entry.href))
        .filter(Boolean),
      ...signals.anchors
        .map((anchor) => toAbsoluteUrl(homeRendered.url, anchor.href))
        .filter(Boolean),
    ] as string[];
    for (const candidate of candidateUrls) {
      if (sameHost(originHost, candidate)) {
        seeded.add(candidate.split("#")[0]!);
      }
    }
    for (const seed of seedFocusLocaleRoots(input.origin, input.focusLocales ?? [])) {
      if (sameHost(originHost, seed)) {
        seeded.add(seed);
      }
    }

    const ranked = [...seeded]
      .map((url) => ({ url, score: scoreCandidate(url, input.origin) }))
      .filter((entry) => entry.score >= 0)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, MAX_PAGES);

    const otherUrls = ranked
      .filter((entry) => entry.url !== homePage.url)
      .map((entry) => entry.url);
    const [otherRendered, sitemap] = await Promise.all([
      otherUrls.length > 0 ? renderer.render(otherUrls) : Promise.resolve([]),
      fetchSitemapSignals(input.origin),
    ]);

    const pagesByUrl = new Map<string, LocalisationAuditCrawledPage>();
    pagesByUrl.set(homePage.url, homePage);
    for (const rendered of otherRendered) {
      const page = pageFromRendered(rendered.html, rendered.url, rendered.status);
      // Ranked seeds use pre-render URLs; Playwright may land on a redirected final URL.
      pagesByUrl.set(rendered.requestedUrl, page);
      pagesByUrl.set(rendered.url, page);
    }

    return {
      pages: ranked
        .map((entry) => pagesByUrl.get(entry.url))
        .filter((page): page is LocalisationAuditCrawledPage => page != null),
      sitemap,
    };
  } finally {
    await renderer.close().catch(() => undefined);
  }
}
