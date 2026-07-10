import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import {
  assertResolvablePublicHttpUrl,
  fetchPublicHttp,
  MAX_PUBLIC_HTTP_RESPONSE_BYTES,
  readBoundedResponseBody,
} from "./public-http-fetch";

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMock.lookup,
}));

describe("public-http-fetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    dnsMock.lookup.mockReset();
    globalThis.fetch = originalFetch;
  });

  it("rejects hostnames that resolve to restricted addresses before fetching", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    globalThis.fetch = vi.fn() as typeof fetch;

    const result = await assertResolvablePublicHttpUrl("https://rebind.example.com/internal");
    expect(result).toEqual({
      ok: false,
      error: { code: "host_resolves_to_restricted_address" },
    });

    await expect(fetchPublicHttp("https://rebind.example.com/internal")).rejects.toThrow(
      "URL host resolves to a private or restricted address.",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches after DNS validation for public hosts", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

    const response = await fetchPublicHttp("https://api.example.com/docs", { method: "GET" });
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/docs",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it("allows literal public IPs without DNS lookup", async () => {
    const result = await assertResolvablePublicHttpUrl("https://93.184.216.34/docs");
    expect(isErr(result)).toBe(false);
    expect(dnsMock.lookup).not.toHaveBeenCalled();
  });

  it("stops reading once the byte cap is exceeded", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PUBLIC_HTTP_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });

    await expect(readBoundedResponseBody(new Response(stream))).rejects.toThrow(
      `exceeds ${MAX_PUBLIC_HTTP_RESPONSE_BYTES} byte limit`,
    );
  });
});
