import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { resolveResolvablePublicHost } from "./ssrf-guard-dns";

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMock.lookup,
}));

describe("ssrf-guard-dns", () => {
  beforeEach(() => {
    dnsMock.lookup.mockReset();
  });

  it("allows hostnames that resolve only to public addresses", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(resolveResolvablePublicHost("api.example.test")).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("rejects hostnames when any DNS answer is restricted", async () => {
    dnsMock.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);

    await expect(resolveResolvablePublicHost("api.example.test")).resolves.toEqual({
      ok: false,
      error: { code: "host_resolves_to_restricted_address" },
    });
  });

  it("rejects blocked literal hosts without DNS lookup", async () => {
    await expect(resolveResolvablePublicHost("127.0.0.1")).resolves.toEqual({
      ok: false,
      error: { code: "host_not_allowed" },
    });
    expect(dnsMock.lookup).not.toHaveBeenCalled();
  });

  it("returns the preferred public address for connect pinning", async () => {
    dnsMock.lookup.mockResolvedValue([
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);

    const { resolvePublicHostAddress } = await import("./ssrf-guard-dns");
    await expect(resolvePublicHostAddress("api.example.test")).resolves.toEqual({
      ok: true,
      value: { address: "93.184.216.34", family: 4 },
    });
  });
});
