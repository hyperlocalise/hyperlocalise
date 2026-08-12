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

    const pages = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(pages.length).toBeGreaterThan(0);
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

    const pages = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(pages).toEqual([]);
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

    const pages = await crawlLocalisationAuditSample({
      origin: "https://example.com",
      sourceUrl: "https://example.com/",
    });

    expect(pages.some((page) => page.url === "https://example.com/en")).toBe(true);
    expect(pages.find((page) => page.url === "https://example.com/en")?.title).toBe("EN");
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
    ).resolves.toEqual([]);
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
});
