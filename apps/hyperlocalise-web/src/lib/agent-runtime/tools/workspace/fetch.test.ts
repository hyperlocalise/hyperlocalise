import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  convertHTMLToMarkdown,
  createFetchTool,
  extractTextFromHTML,
  isAllowedWebUrl,
  isHtmlContent,
  looksLikeHtml,
  MAX_RESPONSE_BYTES,
  readBoundedResponseBody,
} from "./fetch";

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

const undiciMock = vi.hoisted(() => ({
  fetch: vi.fn(),
  close: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMock.lookup,
}));

vi.mock("undici", () => ({
  Agent: vi.fn(function Agent() {
    return { close: undiciMock.close };
  }),
  fetch: undiciMock.fetch,
}));

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
});

describe("looksLikeHtml", () => {
  it("detects doctype and html roots", () => {
    expect(looksLikeHtml("<!doctype html><html><body>Hi</body></html>")).toBe(true);
    expect(looksLikeHtml("<html><body>Hi</body></html>")).toBe(true);
    expect(looksLikeHtml('{"ok":true}')).toBe(false);
  });
});

describe("isHtmlContent", () => {
  it("treats missing content-type HTML as HTML", () => {
    expect(isHtmlContent("<html><body><h1>Title</h1></body></html>", "")).toBe(true);
  });

  it("treats text/plain HTML bodies as HTML", () => {
    expect(isHtmlContent("<html><body><h1>Title</h1></body></html>", "text/plain")).toBe(true);
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

describe("readBoundedResponseBody", () => {
  it("stops reading once the byte cap is exceeded", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });

    await expect(readBoundedResponseBody(new Response(stream))).rejects.toThrow(
      `exceeds ${MAX_RESPONSE_BYTES} byte limit`,
    );
  });
});

describe("createFetchTool", () => {
  beforeEach(() => {
    dnsMock.lookup.mockReset();
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    undiciMock.fetch.mockReset();
    undiciMock.close.mockReset();
    undiciMock.fetch.mockResolvedValue(new Response("ok body", { status: 200 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects HTTP redirects instead of following them", async () => {
    undiciMock.fetch.mockResolvedValue(
      Response.redirect("http://169.254.169.254/latest/meta-data/", 302),
    );

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/page" }, toolCallInfo);

    expect(result).toMatchObject({ success: false });
  });

  it("fetches allowed URLs", async () => {
    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/page" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, status: 200, body: "ok body" });
    expect(undiciMock.fetch).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({ redirect: "error", dispatcher: expect.anything() }),
    );
  });

  it("rejects hostnames that resolve to restricted addresses", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    const tool = createFetchTool();
    const result = await tool.execute!(
      { url: "https://rebind.example.com/internal" },
      toolCallInfo,
    );

    expect(result).toMatchObject({
      success: false,
      error: "URL host resolves to a private or restricted address.",
    });
    expect(undiciMock.fetch).not.toHaveBeenCalled();
  });

  it("returns markdown by default for HTML pages", async () => {
    undiciMock.fetch.mockResolvedValue(
      new Response("<html><body><h1>Docs</h1><p>Content</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/docs" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      format: "markdown",
      contentType: "text/html; charset=utf-8",
      body: expect.stringContaining("# Docs"),
    });
  });

  it("converts HTML without a content-type header to markdown by default", async () => {
    undiciMock.fetch.mockResolvedValue(
      new Response("<html><body><h1>Docs</h1><p>Content</p></body></html>", {
        status: 200,
      }),
    );

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/docs" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      format: "markdown",
      body: expect.stringContaining("# Docs"),
    });
  });

  it("rejects unsupported binary content types", async () => {
    undiciMock.fetch.mockResolvedValue(
      new Response("binary", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/file.pdf" }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Unsupported fetched file content type"),
    });
  });

  it("retries Cloudflare challenges with the fallback user agent", async () => {
    undiciMock.fetch
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
      );

    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/docs" }, toolCallInfo);

    expect(result).toMatchObject({
      success: true,
      body: "plain text",
    });
    expect(undiciMock.fetch).toHaveBeenCalledTimes(2);
  });
});
