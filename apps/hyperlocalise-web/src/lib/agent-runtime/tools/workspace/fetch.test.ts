import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  convertHTMLToMarkdown,
  createFetchTool,
  extractTextFromHTML,
  isAllowedWebUrl,
} from "./fetch";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

describe("isAllowedWebUrl", () => {
  it("allows public https URLs", () => {
    expect(isAllowedWebUrl("https://example.com/docs")).toBe(true);
  });

  it("blocks localhost", () => {
    expect(isAllowedWebUrl("http://localhost:3000")).toBe(false);
  });

  it("blocks private IPs", () => {
    expect(isAllowedWebUrl("http://192.168.1.1")).toBe(false);
  });

  it("blocks IPv6 loopback", () => {
    expect(isAllowedWebUrl("http://[::1]/internal")).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 loopback", () => {
    expect(isAllowedWebUrl("http://[::ffff:127.0.0.1]/internal")).toBe(false);
    expect(isAllowedWebUrl("http://[::ffff:7f00:1]/internal")).toBe(false);
  });

  it("does not treat loopback hosts as allowed", () => {
    expect(isAllowedWebUrl("http://127.0.0.1/internal")).toBe(false);
  });

  it("is vulnerable to DNS-based SSRF (shallow check only)", () => {
    expect(isAllowedWebUrl("http://local.example.com/internal")).toBe(true);
  });
});

describe("extractTextFromHTML", () => {
  it("strips script and style content", () => {
    const html =
      "<html><head><style>body{color:red}</style></head><body><p>Hello</p><script>alert(1)</script></body></html>";
    expect(extractTextFromHTML(html)).toBe("Hello");
  });
});

describe("convertHTMLToMarkdown", () => {
  it("converts headings and paragraphs", () => {
    const html = "<h1>Title</h1><p>Body text</p>";
    expect(convertHTMLToMarkdown(html)).toContain("# Title");
    expect(convertHTMLToMarkdown(html)).toContain("Body text");
  });
});

describe("createFetchTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response("ok body", { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects HTTP redirects instead of following them", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.redirect("http://169.254.169.254/latest/meta-data/", 302),
    ) as typeof fetch;

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/page" }, toolCallInfo);

    expect(result).toMatchObject({ success: false });
  });

  it("fetches allowed URLs", async () => {
    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/page" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, status: 200, body: "ok body" });
  });

  it("returns markdown by default for HTML pages", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html><body><h1>Docs</h1><p>Content</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ) as typeof fetch;

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/docs" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      format: "markdown",
      contentType: "text/html; charset=utf-8",
      body: expect.stringContaining("# Docs"),
    });
  });

  it("rejects unsupported binary content types", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("binary", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
    ) as typeof fetch;

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/file.pdf" }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Unsupported fetched file content type"),
    });
  });

  it("retries Cloudflare challenges with the fallback user agent", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("challenge", {
          status: 403,
          headers: {
            "content-type": "text/html",
            "cf-mitigated": "challenge",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response("plain text", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ) as typeof fetch;

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/docs" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      body: "plain text",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
