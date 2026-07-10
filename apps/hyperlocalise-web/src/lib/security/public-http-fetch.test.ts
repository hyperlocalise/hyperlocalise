import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import {
  assertResolvablePublicHttpUrl,
  MAX_PUBLIC_HTTP_RESPONSE_BYTES,
  readBoundedResponseBody,
  withPublicHttpFetch,
} from "./public-http-fetch";

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

const undiciMock = vi.hoisted(() => ({
  fetch: vi.fn(),
  close: vi.fn(),
  agents: [] as Array<{ connect?: { lookup?: Function } }>,
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMock.lookup,
}));

vi.mock("undici", () => ({
  Agent: vi.fn(function Agent(options: { connect?: { lookup?: Function } }) {
    undiciMock.agents.push(options);
    return { close: undiciMock.close };
  }),
  fetch: undiciMock.fetch,
}));

describe("public-http-fetch", () => {
  beforeEach(() => {
    dnsMock.lookup.mockReset();
    undiciMock.fetch.mockReset();
    undiciMock.close.mockReset();
    undiciMock.agents.length = 0;
  });

  it("rejects hostnames that resolve to restricted addresses before fetching", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    const result = await assertResolvablePublicHttpUrl("https://rebind.example.com/internal");
    expect(result).toEqual({
      ok: false,
      error: { code: "host_resolves_to_restricted_address" },
    });

    await expect(
      withPublicHttpFetch("https://rebind.example.com/internal", undefined, async () => "ok"),
    ).rejects.toThrow("URL host resolves to a private or restricted address.");
    expect(undiciMock.fetch).not.toHaveBeenCalled();
  });

  it("pins the vetted address into the connect lookup while keeping the hostname URL", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    undiciMock.fetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const response = await withPublicHttpFetch(
      "https://api.example.com/docs",
      { method: "GET" },
      async (res) => res,
    );

    expect(response.status).toBe(200);
    expect(undiciMock.fetch).toHaveBeenCalledWith(
      "https://api.example.com/docs",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        dispatcher: expect.anything(),
      }),
    );

    const lookup = undiciMock.agents[0]?.connect?.lookup;
    expect(lookup).toEqual(expect.any(Function));
    const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup?.("api.example.com", {}, (error: Error | null, address: string, family: number) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ address, family });
      });
    });
    expect(pinned).toEqual({ address: "93.184.216.34", family: 4 });
    expect(undiciMock.close).toHaveBeenCalled();
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
