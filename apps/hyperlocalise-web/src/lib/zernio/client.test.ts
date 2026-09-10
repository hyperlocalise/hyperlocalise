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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { createZernioAd, listZernioAds, validateZernioApiKey, zernioRequest } from "./client";
import { ZERNIO_API_BASE_URL } from "./constants";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function requestUrl(input: unknown) {
  return String(input);
}

describe("zernio client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rejects a blank API key before calling Zernio", async () => {
    const result = await zernioRequest({
      apiKey: "   ",
      method: "GET",
      path: "/accounts",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("zernio_api_key_required");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates an API key by listing accounts", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({
        accounts: [{ _id: "acct_1" }, { _id: "acct_2" }],
      }),
    );

    const result = await validateZernioApiKey({ apiKey: "sk_live_test" });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ accountCount: 2 });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl(url)).toBe(`${ZERNIO_API_BASE_URL}/accounts`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_test");
  });

  it("maps unauthorized responses to validation failure", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ error: "Invalid API key" }, 401));

    const result = await validateZernioApiKey({ apiKey: "sk_bad" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("zernio_connection_validation_failed");
      expect(result.error.message).toBe("Invalid API key");
    }
  });

  it("sends create-ad bodies with an idempotency key", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ ad: { _id: "ad_1" } }, 201));

    const result = await createZernioAd({
      apiKey: "sk_live_test",
      idempotencyKey: "create-ad-1",
      body: {
        accountId: "acct_1",
        adAccountId: "act_1",
        name: "Paused launch",
        status: "PAUSED",
      },
    });

    expect(isOk(result)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl(url)).toBe(`${ZERNIO_API_BASE_URL}/ads/create`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("create-ad-1");
    expect(JSON.parse(typeof init.body === "string" ? init.body : "")).toEqual({
      accountId: "acct_1",
      adAccountId: "act_1",
      name: "Paused launch",
      status: "PAUSED",
    });
  });

  it("scopes the ads tree by accountId", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ campaigns: [] }));

    const result = await listZernioAds({
      apiKey: "sk_live_test",
      accountId: "acct_1",
    });

    expect(isOk(result)).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.origin + url.pathname).toBe(`${ZERNIO_API_BASE_URL}/ads/tree`);
    expect(url.searchParams.get("accountId")).toBe("acct_1");
  });

  it("maps aborted fetches to a timeout error", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    const result = await zernioRequest({
      apiKey: "sk_live_test",
      method: "GET",
      path: "/accounts",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("zernio_request_timeout");
    }
  });
});
