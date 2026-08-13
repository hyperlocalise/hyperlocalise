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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { withPublicHttpFetchMock } = vi.hoisted(() => ({
  withPublicHttpFetchMock: vi.fn(),
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    withPublicHttpFetch: withPublicHttpFetchMock,
  };
});

import { crawlLocalisationAuditSample } from "./crawl";

function htmlResponse(html: string, init?: ResponseInit) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

describe("crawlLocalisationAuditSample", () => {
  beforeEach(() => {
    withPublicHttpFetchMock.mockReset();
  });

  it("uses redirect: manual and never requests redirect: follow", async () => {
    withPublicHttpFetchMock.mockImplementation(async (url, init, handler) => {
      expect(init?.redirect).toBe("manual");
      if (url === "https://example.com/") {
        return handler(
          htmlResponse("<html lang='en'><title>Home</title><body>Hello world page</body></html>"),
        );
      }
      return handler(htmlResponse("<html><body>Other page content here for sample</body></html>"));
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(result.pages.length).toBeGreaterThan(0);
    expect(withPublicHttpFetchMock.mock.calls.every((call) => call[1]?.redirect === "manual")).toBe(
      true,
    );
  });

  it("re-validates each redirect hop so private Location targets are not fetched", async () => {
    const fetchedUrls: string[] = [];
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      fetchedUrls.push(url);
      if (url === "https://example.com/") {
        return handler(
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/secret" },
          }),
        );
      }
      // Simulate withPublicHttpFetch rejecting the private hop.
      throw new Error("URL host is not allowed.");
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(result.pages).toEqual([]);
    expect(fetchedUrls).toEqual(["https://example.com/", "http://127.0.0.1/secret"]);
  });

  it("follows a same-host public redirect and crawls the final URL", async () => {
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      if (url === "https://example.com/") {
        return handler(
          new Response(null, {
            status: 301,
            headers: { location: "https://example.com/en" },
          }),
        );
      }
      if (url === "https://example.com/en") {
        return handler(
          htmlResponse(
            `<html lang="en"><head><title>EN</title><link rel="alternate" hreflang="fr" href="/fr" /></head><body><a href="/pricing">Pricing</a> Welcome to the English homepage content.</body></html>`,
          ),
        );
      }
      return handler(
        htmlResponse(
          "<html><body>Secondary page with enough text content for parsing.</body></html>",
        ),
      );
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(result.pages.some((page) => page.url === "https://example.com/en")).toBe(true);
    expect(result.pages.find((page) => page.url === "https://example.com/en")?.title).toBe("EN");
  });

  it("returns an empty sample when the home page fetch fails instead of throwing", async () => {
    withPublicHttpFetchMock.mockImplementation(async () => {
      throw new Error("URL host is not allowed.");
    });

    await expect(
      crawlLocalisationAuditSample({
        origin: "https://example.com",
        sourceUrl: "https://example.com/",
      }),
    ).resolves.toEqual({
      pages: [],
      sitemap: { robotsFound: false, sitemapUrls: [], localizedUrls: [] },
    });
  });

  it("reuses one abort signal across redirect hops so the page timeout does not reset", async () => {
    const signals: AbortSignal[] = [];
    withPublicHttpFetchMock.mockImplementation(async (url, init, handler) => {
      if (init?.signal) {
        signals.push(init.signal);
      }
      if (url === "https://example.com/") {
        return handler(
          new Response(null, {
            status: 302,
            headers: { location: "https://example.com/en" },
          }),
        );
      }
      if (url === "https://example.com/en") {
        return handler(
          htmlResponse(
            "<html lang='en'><title>EN</title><body>Welcome to the English homepage content.</body></html>",
          ),
        );
      }
      return handler(
        htmlResponse(
          "<html><body>Secondary page with enough text content for parsing.</body></html>",
        ),
      );
    });

    await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals[0]).toBe(signals[1]);
  });

  it("crawls homepage links and hreflang without inventing high-value paths", async () => {
    const fetchedUrls: string[] = [];
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      fetchedUrls.push(url);
      if (url === "https://example.com/") {
        return handler(
          htmlResponse(
            `<html lang="en"><head><title>Home</title><link rel="alternate" hreflang="fr" href="/fr" /><link rel="alternate" hreflang="x-default" href="/" /></head><body><a href="/de">Deutsch</a> Welcome to the homepage content sample.</body></html>`,
          ),
        );
      }
      if (url === "https://example.com/fr") {
        return handler(
          htmlResponse(
            "<html lang='fr'><title>Accueil</title><body>Page d accueil francaise avec contenu.</body></html>",
          ),
        );
      }
      return handler(
        htmlResponse(
          "<html><body>Secondary page with enough text content for parsing.</body></html>",
        ),
      );
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(fetchedUrls).toContain("https://example.com/fr");
    expect(fetchedUrls).toContain("https://example.com/de");
    expect(fetchedUrls).not.toContain("https://example.com/ja/pricing");
    expect(fetchedUrls).not.toContain("https://example.com/fr/pricing");
    expect(fetchedUrls).not.toContain("https://example.com/pricing");
    expect(result.pages.some((page) => page.url === "https://example.com/fr")).toBe(true);
  });

  it("seeds requested focus locale roots without inventing high-value paths", async () => {
    const fetchedUrls: string[] = [];
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      fetchedUrls.push(url);
      if (url === "https://example.com/") {
        return handler(
          htmlResponse(
            "<html lang='en'><head><title>Home</title></head><body>Welcome to the homepage content sample.</body></html>",
          ),
        );
      }
      if (url === "https://example.com/ja") {
        return handler(
          htmlResponse(
            "<html lang='ja'><title>ホーム</title><body>日本語のホームページのサンプルコンテンツです。</body></html>",
          ),
        );
      }
      return handler(
        htmlResponse(
          "<html><body>Secondary page with enough text content for parsing.</body></html>",
        ),
      );
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
      focusLocales: ["ja", "x-default"],
    });

    expect(fetchedUrls).toContain("https://example.com/ja");
    expect(fetchedUrls).not.toContain("https://example.com/ja/pricing");
    expect(result.pages.some((page) => page.url === "https://example.com/ja")).toBe(true);
  });

  it("parses robots.txt and sitemap locale URLs without adding them as scored pages", async () => {
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      if (url === "https://example.com/robots.txt") {
        return handler(
          new Response("Sitemap: https://example.com/sitemap.xml\n", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        );
      }
      if (url === "https://example.com/sitemap.xml") {
        return handler(
          new Response(
            `<?xml version="1.0"?><urlset><loc>https://example.com/fr/pricing</loc><loc>https://example.com/about</loc></urlset>`,
            { status: 200, headers: { "content-type": "application/xml" } },
          ),
        );
      }
      if (url === "https://example.com/") {
        return handler(
          htmlResponse(
            "<html lang='en'><title>Home</title><body>Welcome to the homepage content sample.</body></html>",
          ),
        );
      }
      return handler(
        htmlResponse(
          "<html><body>Secondary page with enough text content for parsing.</body></html>",
        ),
      );
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(result.sitemap.robotsFound).toBe(true);
    expect(result.sitemap.sitemapUrls).toContain("https://example.com/sitemap.xml");
    expect(result.sitemap.localizedUrls).toContain("https://example.com/fr/pricing");
    expect(result.pages.some((page) => page.url === "https://example.com/sitemap.xml")).toBe(false);
  });

  it("does not keep a sitemap URL when robots.txt exists but sitemap.xml cannot be fetched", async () => {
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      if (url === "https://example.com/robots.txt") {
        return handler(
          new Response("User-agent: *\nDisallow:\n", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        );
      }
      if (url === "https://example.com/sitemap.xml") {
        return handler(
          new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } }),
        );
      }
      if (url === "https://example.com/") {
        return handler(
          htmlResponse(
            "<html lang='en'><title>Home</title><body>Welcome to the homepage content sample.</body></html>",
          ),
        );
      }
      return handler(
        htmlResponse(
          "<html><body>Secondary page with enough text content for parsing.</body></html>",
        ),
      );
    });

    const result = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(result.sitemap.robotsFound).toBe(true);
    expect(result.sitemap.sitemapUrls).toEqual([]);
  });
});
