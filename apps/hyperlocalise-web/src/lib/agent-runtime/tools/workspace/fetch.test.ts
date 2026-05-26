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

  it("fetches allowed URLs", async () => {
    const tool = createFetchTool();
    const result = await tool.execute!({ url: "https://example.com/page" }, toolCallInfo);
    expect(result).toMatchObject({ success: true, status: 200, body: "ok body" });
  });

  it("does not treat loopback hosts as allowed", () => {
    expect(isAllowedWebUrl("http://127.0.0.1/internal")).toBe(false);
  });
});
