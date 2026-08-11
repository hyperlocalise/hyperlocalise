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
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HIGH_VALUE_PATHS = ["/pricing", "/product", "/products", "/about", "/company", "/blog"];

const LOCALE_PREFIX = /^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i;

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

/**
 * Follow redirects manually so each hop is re-validated by withPublicHttpFetch.
 * Never use redirect:"follow" — undici can connect to IP-literal Location targets
 * without the DNS pin, bypassing the SSRF guard.
 */
async function fetchPublicWithSafeRedirects<T>(
  startUrl: string,
  handler: (response: Response, finalUrl: string) => Promise<T>,
): Promise<T | null> {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
        return outcome.value;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchPage(url: string): Promise<LocalisationAuditCrawledPage | null> {
  return fetchPublicWithSafeRedirects(url, async (response, finalUrl) => {
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
}

async function fetchPageWithAnchors(url: string): Promise<{
  page: LocalisationAuditCrawledPage;
  candidateUrls: string[];
} | null> {
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
    if (HIGH_VALUE_PATHS.some((candidate) => path === candidate || path.endsWith(candidate))) {
      return 80;
    }
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
}): Promise<LocalisationAuditCrawledPage[]> {
  const home = await fetchPageWithAnchors(input.sourceUrl);
  if (!home) {
    return [];
  }

  const originHost = new URL(input.origin).hostname;
  const seeded = new Set<string>([home.page.url]);
  for (const path of HIGH_VALUE_PATHS) {
    seeded.add(new URL(path, input.origin).toString());
  }
  for (const candidate of home.candidateUrls) {
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
    if (entry.url === home.page.url) {
      return home.page;
    }
    return fetchPage(entry.url);
  });

  return pages.filter((page): page is LocalisationAuditCrawledPage => page != null);
}
