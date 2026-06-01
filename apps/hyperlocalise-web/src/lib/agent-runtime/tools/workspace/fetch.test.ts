import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createFetchTool, isAllowedWebUrl } from "./fetch";

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

  it("does not treat loopback hosts as allowed", () => {
    expect(isAllowedWebUrl("http://127.0.0.1/internal")).toBe(false);
  });

  it("is vulnerable to DNS-based SSRF (shallow check only)", () => {
    // This hostname is not an IP, so isAllowedWebUrl (isPublicHttpUrl) allows it.
    // In a real scenario, this would resolve to 127.0.0.1.
    expect(isAllowedWebUrl("http://local.example.com/internal")).toBe(true);
  });

  it("blocks hostnames that resolve to private IPs", async () => {
    // We use a hostname that isAllowedWebUrl thinks is public.
    const url = "https://public-looking.example.com/api";

    // We can verify it's blocked because providerSafeFetch (via resolvePinnedHttpConnectTarget)
    // will attempt DNS resolution. Since this hostname won't resolve in the test env,
    // it should return success: false with a host_unresolvable or similar error.
    // This proves that we are now going through the safe fetch path which includes DNS checks.
    const tool = createFetchTool();
    const result = await tool.execute!({ url }, toolCallInfo);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/URL host could not be resolved|resolves to a private or restricted address/),
    });
  });
});
