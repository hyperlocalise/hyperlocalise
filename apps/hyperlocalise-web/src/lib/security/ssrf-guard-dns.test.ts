import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import { resolvePinnedHttpConnectTarget } from "./ssrf-guard-dns";

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

  it("pins hostname requests to the vetted IP address", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const result = await resolvePinnedHttpConnectTarget(
      "https://api.example.test:8443/v2/projects?per_page=100",
    );

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    expect(result.value).toEqual({
      requestUrl: "https://93.184.216.34:8443/v2/projects?per_page=100",
      hostHeader: "api.example.test:8443",
      connect: {
        host: "93.184.216.34",
        port: 8443,
        servername: "api.example.test",
      },
    });
  });

  it("rejects hostnames when any DNS answer is restricted", async () => {
    dnsMock.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);

    const result = await resolvePinnedHttpConnectTarget("https://api.example.test/v2/projects");

    expect(result).toEqual({
      ok: false,
      error: { code: "host_resolves_to_restricted_address" },
    });
  });
});
