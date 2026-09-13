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
import { dictionaryClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("dictionaryClient", () => {
  it("calls Go directly with the session cookie and encoded filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"dictionaries":[],"total":0}'));
    vi.stubGlobal("fetch", fetchMock);
    await dictionaryClient.list({
      param: { organizationSlug: "acme" },
      query: { limit: "10", offset: "20", projectId: "ext:provider:123" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/go-svc/v1/orgs/acme/dictionaries?limit=10&offset=20&projectId=ext%3Aprovider%3A123",
      { method: "GET", credentials: "same-origin" },
    );
  });
  it("serializes mutation payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await dictionaryClient.addWord({
      param: { organizationSlug: "acme", dictionaryId: "dict" },
      json: { locale: "en-US", word: "Brand" },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/go-svc/v1/orgs/acme/dictionaries/dict/words", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: '{"locale":"en-US","word":"Brand"}',
    });
  });
  it("encodes project path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await dictionaryClient.resolvedWords({
      param: { organizationSlug: "acme", projectId: "project/a" },
      query: { locale: "en-US" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/go-svc/v1/orgs/acme/projects/project%2Fa/dictionaries/resolved?locale=en-US",
    );
  });
  it("preserves errors for the existing UI error reader", async () => {
    const response = new Response('{"error":"forbidden"}', { status: 403 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const result = await dictionaryClient.remove({
      param: { organizationSlug: "acme", dictionaryId: "dict" },
    });
    expect(result).toBe(response);
    expect(result.status).toBe(403);
  });
  it("keeps exports as raw responses", async () => {
    const response = new Response("Brand\n", { headers: { "Content-Type": "text/plain" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const result = await dictionaryClient.exportWords({
      param: { organizationSlug: "acme", dictionaryId: "dict" },
      query: { locale: "en-US" },
    });
    expect(await result.text()).toBe("Brand\n");
  });
});
