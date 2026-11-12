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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const playwrightMocks = vi.hoisted(() => ({
  connectOverCDP: vi.fn(),
  newContext: vi.fn(),
  newPage: vi.fn(),
  browserClose: vi.fn(),
  contextClose: vi.fn(),
  contexts: vi.fn(),
}));

const assertResolvablePublicHttpUrlMock = vi.hoisted(() => vi.fn());

vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: playwrightMocks.connectOverCDP },
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    assertResolvablePublicHttpUrl: assertResolvablePublicHttpUrlMock,
  };
});

import { isErr, ok } from "@/lib/primitives/result/results";

import { AUDIT_BROWSER_VIEWPORT } from "./audit-playwright-script";
import { createTilionAuditBrowserSession, TILION_API_BASE_URL } from "./tilion-browser";

const fetchMock = vi.fn<typeof fetch>();

function fakePage(input: { finalUrl: string; html: string; status: number }) {
  const layout = { width: 1440, horizontalOverflowPx: 0, clippedText: [], offscreen: [] };
  return {
    goto: vi.fn(async () => ({ status: () => input.status })),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    url: () => input.finalUrl,
    content: vi.fn(async () => input.html),
    evaluate: vi.fn(async () => layout),
    setViewportSize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

describe("createTilionAuditBrowserSession", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    for (const mock of Object.values(playwrightMocks)) mock.mockReset();
    assertResolvablePublicHttpUrlMock.mockReset();
    assertResolvablePublicHttpUrlMock.mockImplementation(async (url: string) => ok(new URL(url)));

    playwrightMocks.browserClose.mockResolvedValue(undefined);
    playwrightMocks.contextClose.mockResolvedValue(undefined);
    const context = { newPage: playwrightMocks.newPage, close: playwrightMocks.contextClose };
    playwrightMocks.newContext.mockResolvedValue(context);
    playwrightMocks.contexts.mockReturnValue([context]);
    playwrightMocks.connectOverCDP.mockResolvedValue({
      contexts: playwrightMocks.contexts,
      newContext: playwrightMocks.newContext,
      close: playwrightMocks.browserClose,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders vetted URLs in the stealth context and deletes the session on close", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({
            session_id: "sess_1",
            connect_url: "wss://back.tilion.dev/v1/session/sess_1/cdp?token=t",
          })
        : new Response(null, { status: 204 }),
    );
    const page = fakePage({
      finalUrl: "https://example.com/en",
      html: "<html lang='en'><title>EN</title></html>",
      status: 200,
    });
    playwrightMocks.newPage.mockResolvedValue(page);

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });
    if (isErr(session)) throw new Error(session.error.code);
    const pages = await session.value.render(["https://example.com/", "http://127.0.0.1/secret"]);
    await session.value.close();

    expect(fetchMock).toHaveBeenCalledWith(
      `${TILION_API_BASE_URL}/v1/session`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tl_key" }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      region: "us",
    });
    expect(playwrightMocks.connectOverCDP).toHaveBeenCalledWith(
      "wss://back.tilion.dev/v1/session/sess_1/cdp?token=t",
      expect.anything(),
    );
    expect(playwrightMocks.newContext).not.toHaveBeenCalled();
    expect(playwrightMocks.newPage).toHaveBeenCalledTimes(1);
    expect(page.setViewportSize).toHaveBeenNthCalledWith(1, AUDIT_BROWSER_VIEWPORT);
    expect(playwrightMocks.contextClose).not.toHaveBeenCalled();
    expect(pages).toEqual([
      {
        requestedUrl: "https://example.com/",
        url: "https://example.com/en",
        status: 200,
        html: "<html lang='en'><title>EN</title></html>",
        layout: {
          viewports: [
            { width: 1440, horizontalOverflowPx: 0, clippedText: [], offscreen: [] },
            { width: 1440, horizontalOverflowPx: 0, clippedText: [], offscreen: [] },
          ],
        },
      },
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${TILION_API_BASE_URL}/v1/session/sess_1`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("falls back to an isolated context without the audit bot user agent", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ session_id: "sess_1", connect_url: "wss://tilion/cdp" })
        : new Response(null, { status: 204 }),
    );
    playwrightMocks.contexts.mockReturnValue([]);

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });
    if (isErr(session)) throw new Error(session.error.code);
    await session.value.close();

    expect(playwrightMocks.newContext).toHaveBeenCalledWith(
      expect.objectContaining({ viewport: AUDIT_BROWSER_VIEWPORT }),
    );
    expect(playwrightMocks.newContext.mock.calls[0]?.[0]).not.toHaveProperty("userAgent");
    expect(playwrightMocks.contextClose).toHaveBeenCalled();
  });

  it("fetches text resources through the Tilion browser", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ session_id: "sess_1", connect_url: "wss://tilion/cdp" })
        : new Response(null, { status: 204 }),
    );
    const robots = "User-agent: *\nSitemap: https://example.com/sitemap.xml\n";
    const page = {
      goto: vi.fn(async () => ({ status: () => 200, text: async () => robots })),
      url: () => "https://example.com/robots.txt",
      close: vi.fn(async () => undefined),
    };
    playwrightMocks.newPage.mockResolvedValue(page);

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });
    if (isErr(session)) throw new Error(session.error.code);

    expect(await session.value.fetchText?.("https://example.com/robots.txt")).toBe(robots);
    expect(page.goto).toHaveBeenCalledWith("https://example.com/robots.txt", expect.anything());
    expect(page.close).toHaveBeenCalled();
  });

  it("returns null for missing or private text resources", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ session_id: "sess_1", connect_url: "wss://tilion/cdp" })
        : new Response(null, { status: 204 }),
    );
    playwrightMocks.newPage.mockResolvedValue({
      goto: vi.fn(async () => ({ status: () => 404, text: async () => "Not found" })),
      url: () => "https://example.com/sitemap.xml",
      close: vi.fn(async () => undefined),
    });

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });
    if (isErr(session)) throw new Error(session.error.code);

    expect(await session.value.fetchText?.("https://example.com/sitemap.xml")).toBeNull();
    expect(await session.value.fetchText?.("http://127.0.0.1/robots.txt")).toBeNull();
  });

  it("drops pages that redirect to a private address", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ session_id: "sess_1", connect_url: "wss://tilion/cdp" })
        : new Response(null, { status: 204 }),
    );
    playwrightMocks.newPage.mockResolvedValue(
      fakePage({ finalUrl: "http://169.254.169.254/latest", html: "<html></html>", status: 200 }),
    );

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });
    if (isErr(session)) throw new Error(session.error.code);

    expect(await session.value.render(["https://example.com/"])).toEqual([]);
  });

  it("returns an error when Tilion refuses the session", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 402 }));

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });

    expect(isErr(session) && session.error).toEqual({
      code: "tilion_session_create_failed",
      status: 402,
    });
    expect(playwrightMocks.connectOverCDP).not.toHaveBeenCalled();
  });

  it("deletes the session when raw CDP is not enabled for the key", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ session_id: "sess_1", connect_url: null })
        : new Response(null, { status: 204 }),
    );

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });

    expect(isErr(session) && session.error).toEqual({ code: "tilion_cdp_unavailable" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${TILION_API_BASE_URL}/v1/session/sess_1`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deletes the session when the CDP connection fails", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ session_id: "sess_1", connect_url: "wss://tilion/cdp" })
        : new Response(null, { status: 204 }),
    );
    playwrightMocks.connectOverCDP.mockRejectedValue(new Error("403"));

    const session = await createTilionAuditBrowserSession({ apiKey: "tl_key" });

    expect(isErr(session) && session.error).toEqual({ code: "tilion_connect_failed" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${TILION_API_BASE_URL}/v1/session/sess_1`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
