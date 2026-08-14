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

import type { HtmlPageRenderer, RenderedHtmlPage } from "./crawl-renderer";
import { AuditBrowserSetupError } from "./sandbox-browser-error";

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

function htmlPage(
  requestedUrl: string,
  html: string,
  overrides?: Partial<RenderedHtmlPage>,
): RenderedHtmlPage {
  return {
    requestedUrl,
    url: overrides?.url ?? requestedUrl,
    status: overrides?.status ?? 200,
    html,
    ...overrides,
  };
}

function rendererFromPages(pages: RenderedHtmlPage[]): HtmlPageRenderer {
  const byRequest = new Map(pages.map((page) => [page.requestedUrl, page]));
  const rendered: string[] = [];
  return {
    async render(urls) {
      rendered.push(...urls);
      return urls.flatMap((url) => {
        const page = byRequest.get(url);
        return page ? [page] : [];
      });
    },
    async close() {},
    rendered,
  } as HtmlPageRenderer & { rendered: string[] };
}

function mockBrowser(pages: RenderedHtmlPage[]) {
  const renderer = rendererFromPages(pages);
  return {
    renderer,
    createRenderer: async () => renderer,
    renderedUrls: (renderer as HtmlPageRenderer & { rendered: string[] }).rendered,
  };
}

describe("crawlLocalisationAuditSample", () => {
  beforeEach(() => {
    withPublicHttpFetchMock.mockReset();
    withPublicHttpFetchMock.mockImplementation(async (url, init, handler) => {
      expect(init?.redirect).toBe("manual");
      if (url.endsWith("/robots.txt") || url.endsWith("/sitemap.xml")) {
        return handler(new Response("Not found", { status: 404 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  it("renders HTML in the supplied browser session instead of fetching pages", async () => {
    const { createRenderer, renderedUrls } = mockBrowser([
      htmlPage(
        "https://example.com/",
        "<html lang='en'><title>Home</title><body>Hello world page</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0]?.title).toBe("Home");
    expect(renderedUrls).toContain("https://example.com/");
    expect(
      withPublicHttpFetchMock.mock.calls.every(
        (call) => String(call[0]).includes("robots.txt") || String(call[0]).includes("sitemap.xml"),
      ),
    ).toBe(true);
  });

  it("follows a rendered homepage redirect and crawls the final URL", async () => {
    const { createRenderer } = mockBrowser([
      htmlPage(
        "https://example.com/",
        `<html lang="en"><head><title>EN</title><link rel="alternate" hreflang="fr" href="/fr" /></head><body><a href="/pricing">Pricing</a> Welcome to the English homepage content.</body></html>`,
        { url: "https://example.com/en" },
      ),
      htmlPage(
        "https://example.com/fr",
        "<html lang='fr'><title>Accueil</title><body>Page d accueil francaise avec contenu.</body></html>",
      ),
      htmlPage(
        "https://example.com/pricing",
        "<html><body>Secondary page with enough text content for parsing.</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(result.pages.some((page) => page.url === "https://example.com/en")).toBe(true);
    expect(result.pages.find((page) => page.url === "https://example.com/en")?.title).toBe("EN");
  });

  it("returns an empty sample when the home page render fails instead of throwing", async () => {
    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer: async () => rendererFromPages([]) },
    );

    expect(result).toEqual({
      pages: [],
      sitemap: {
        robotsFound: false,
        robotsSitemapDirectives: [],
        robotsHasRelativeSitemapDirective: false,
        sitemapUrls: [],
        localizedUrls: [],
      },
    });
  });

  it("rethrows browser setup failures so the workflow step can retry", async () => {
    await expect(
      crawlLocalisationAuditSample(
        { origin: "https://example.com", sourceUrl: "https://example.com/" },
        {
          createRenderer: async () => {
            throw new AuditBrowserSetupError("sandbox image is missing Playwright");
          },
        },
      ),
    ).rejects.toThrow(AuditBrowserSetupError);
  });

  it("crawls homepage links and hreflang without inventing high-value paths", async () => {
    const { createRenderer, renderedUrls } = mockBrowser([
      htmlPage(
        "https://example.com/",
        `<html lang="en"><head><title>Home</title><link rel="alternate" hreflang="fr" href="/fr" /><link rel="alternate" hreflang="x-default" href="/" /></head><body><a href="/de">Deutsch</a> Welcome to the homepage content sample.</body></html>`,
      ),
      htmlPage(
        "https://example.com/fr",
        "<html lang='fr'><title>Accueil</title><body>Page d accueil francaise avec contenu.</body></html>",
      ),
      htmlPage(
        "https://example.com/de",
        "<html lang='de'><title>Start</title><body>Deutsche Startseite mit genug Inhalt.</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(renderedUrls).toContain("https://example.com/fr");
    expect(renderedUrls).toContain("https://example.com/de");
    expect(renderedUrls).not.toContain("https://example.com/ja/pricing");
    expect(renderedUrls).not.toContain("https://example.com/fr/pricing");
    expect(renderedUrls).not.toContain("https://example.com/pricing");
    expect(result.pages.some((page) => page.url === "https://example.com/fr")).toBe(true);
  });

  it("seeds requested focus locale roots without inventing high-value paths", async () => {
    const { createRenderer, renderedUrls } = mockBrowser([
      htmlPage(
        "https://example.com/",
        "<html lang='en'><head><title>Home</title></head><body>Welcome to the homepage content sample.</body></html>",
      ),
      htmlPage(
        "https://example.com/ja",
        "<html lang='ja'><title>ホーム</title><body>日本語のホームページのサンプルコンテンツです。</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      {
        origin: "https://example.com",
        sourceUrl: "https://example.com/",
        focusLocales: ["ja", "x-default"],
      },
      { createRenderer },
    );

    expect(renderedUrls).toContain("https://example.com/ja");
    expect(renderedUrls).not.toContain("https://example.com/ja/pricing");
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
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { createRenderer } = mockBrowser([
      htmlPage(
        "https://example.com/",
        "<html lang='en'><title>Home</title><body>Welcome to the homepage content sample.</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(result.sitemap.robotsFound).toBe(true);
    expect(result.sitemap.robotsSitemapDirectives).toContain("https://example.com/sitemap.xml");
    expect(result.sitemap.robotsHasRelativeSitemapDirective).toBe(false);
    expect(result.sitemap.sitemapUrls).toContain("https://example.com/sitemap.xml");
    expect(result.sitemap.localizedUrls).toContain("https://example.com/fr/pricing");
    expect(result.pages.some((page) => page.url === "https://example.com/sitemap.xml")).toBe(false);
  });

  it("records relative Sitemap directives from robots.txt", async () => {
    withPublicHttpFetchMock.mockImplementation(async (url, _init, handler) => {
      if (url === "https://example.com/robots.txt") {
        return handler(
          new Response("Sitemap: /sitemap.xml\n", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        );
      }
      if (url === "https://example.com/sitemap.xml") {
        return handler(
          new Response(
            `<?xml version="1.0"?><urlset><loc>https://example.com/about</loc></urlset>`,
            { status: 200, headers: { "content-type": "application/xml" } },
          ),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { createRenderer } = mockBrowser([
      htmlPage(
        "https://example.com/",
        "<html lang='en'><title>Home</title><body>Welcome to the homepage content sample.</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(result.sitemap.robotsHasRelativeSitemapDirective).toBe(true);
    expect(result.sitemap.robotsSitemapDirectives).toContain("https://example.com/sitemap.xml");
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
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { createRenderer } = mockBrowser([
      htmlPage(
        "https://example.com/",
        "<html lang='en'><title>Home</title><body>Welcome to the homepage content sample.</body></html>",
      ),
    ]);

    const result = await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(result.sitemap.robotsFound).toBe(true);
    expect(result.sitemap.robotsSitemapDirectives).toEqual([]);
    expect(result.sitemap.sitemapUrls).toEqual([]);
  });

  it("uses redirect: manual for robots and sitemap fetches", async () => {
    const { createRenderer } = mockBrowser([
      htmlPage(
        "https://example.com/",
        "<html lang='en'><title>Home</title><body>Hello world page</body></html>",
      ),
    ]);

    await crawlLocalisationAuditSample(
      { origin: "https://example.com", sourceUrl: "https://example.com/" },
      { createRenderer },
    );

    expect(withPublicHttpFetchMock.mock.calls.every((call) => call[1]?.redirect === "manual")).toBe(
      true,
    );
  });
});
