import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import { pinnedPublicFetch } from "./pinned-fetch";

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

describe("pinnedPublicFetch", () => {
  beforeEach(() => {
    dnsMock.lookup.mockReset();
    undiciMock.fetch.mockReset();
    undiciMock.close.mockReset();
  });

  it("pins hostname requests to vetted addresses and sets Host header", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    undiciMock.fetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const response = await pinnedPublicFetch("https://api.example.com/docs");

    expect(response.status).toBe(200);
    expect(undiciMock.fetch).toHaveBeenCalledWith(
      "https://93.184.216.34/docs",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const init = undiciMock.fetch.mock.calls[0]?.[1] as { headers: Headers };
    expect(init.headers.get("Host")).toBe("api.example.com");
    expect(undiciMock.close).toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to restricted addresses", async () => {
    dnsMock.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);

    await expect(pinnedPublicFetch("https://rebind.example.com/internal")).rejects.toThrow(
      "URL host resolves to a private or restricted address.",
    );
    expect(undiciMock.fetch).not.toHaveBeenCalled();
  });

  it("returns DNS validation errors from resolvePinnedHttpConnectTarget", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    await expect(pinnedPublicFetch("https://metadata.example.com/latest")).rejects.toThrow(
      "URL host resolves to a private or restricted address.",
    );
  });
});

describe("resolvePinnedHttpConnectTarget integration", () => {
  it("documents expected DNS guard behavior for fetch callers", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const { resolvePinnedHttpConnectTarget } = await import("@/lib/security/ssrf-guard-dns");
    const result = await resolvePinnedHttpConnectTarget("https://api.example.com/resource");

    expect(isErr(result)).toBe(false);
  });
});
