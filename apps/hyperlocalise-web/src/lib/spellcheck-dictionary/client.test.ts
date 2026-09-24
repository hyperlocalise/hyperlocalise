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

import { DEFAULT_GO_SVC_BASE_URL, GoSvcClient } from "@/lib/go-svc/go-svc-client";

import { createDictionaryClient } from "./client";

function createTestClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createDictionaryClient(
    new GoSvcClient({
      getAccessToken: () => "access-token",
      fetch: fetchMock as unknown as typeof fetch,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("createDictionaryClient", () => {
  it("calls Go directly with the access token and encoded filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"dictionaries":[],"total":0}'));
    const dictionaryClient = createTestClient(fetchMock);
    await dictionaryClient.list({
      param: { organizationSlug: "acme" },
      query: { limit: "10", offset: "20", projectId: "ext:provider:123" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/dictionaries?limit=10&offset=20&projectId=ext%3Aprovider%3A123`,
    );
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("serializes mutation payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    const dictionaryClient = createTestClient(fetchMock);
    await dictionaryClient.addWord({
      param: { organizationSlug: "acme", dictionaryId: "dict" },
      json: { locale: "en-US", word: "Brand" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/dictionaries/dict/words`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"locale":"en-US","word":"Brand"}');
  });

  it("encodes project path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    const dictionaryClient = createTestClient(fetchMock);
    await dictionaryClient.resolvedWords({
      param: { organizationSlug: "acme", projectId: "project/a" },
      query: { locale: "en-US" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${DEFAULT_GO_SVC_BASE_URL}/v1/orgs/acme/projects/project%2Fa/dictionaries/resolved?locale=en-US`,
    );
  });

  it("throws typed errors for failed requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"forbidden"}', { status: 403 }));
    const dictionaryClient = createTestClient(fetchMock);
    await expect(
      dictionaryClient.remove({ param: { organizationSlug: "acme", dictionaryId: "dict" } }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("returns export metadata and content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Brand\n", { headers: { "Content-Type": "text/plain" } }));
    const dictionaryClient = createTestClient(fetchMock);
    const result = await dictionaryClient.exportWords({
      param: { organizationSlug: "acme", dictionaryId: "dict" },
      query: { locale: "en-US" },
    });
    expect(await result.blob.text()).toBe("Brand\n");
    expect(result.contentType).toBe("text/plain");
  });
});
