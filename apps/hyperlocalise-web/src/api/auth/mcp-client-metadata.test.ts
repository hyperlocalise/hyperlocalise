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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { withPublicHttpFetchMock } = vi.hoisted(() => ({
  withPublicHttpFetchMock: vi.fn(),
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();

  return {
    ...actual,
    withPublicHttpFetch: withPublicHttpFetchMock,
  };
});

import { fetchMcpClientMetadataDocument, resolveMcpClientMetadata } from "./mcp-client-metadata";

describe("fetchMcpClientMetadataDocument", () => {
  beforeEach(() => {
    withPublicHttpFetchMock.mockReset();
  });

  it("fetches a JSON document through the public HTTP guard", async () => {
    const clientId = "https://client.example/oauth/metadata.json";
    const document = {
      client_id: clientId,
      client_name: "Example MCP Client",
      redirect_uris: ["http://localhost:3000/callback"],
    };

    withPublicHttpFetchMock.mockImplementation(async (_url, _init, handler) =>
      handler(
        new Response(JSON.stringify(document), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }),
      ),
    );

    await expect(fetchMcpClientMetadataDocument(clientId)).resolves.toEqual(document);

    expect(withPublicHttpFetchMock).toHaveBeenCalledWith(
      clientId,
      expect.objectContaining({
        method: "GET",
        redirect: "error",
      }),
      expect.any(Function),
      {
        maxResponseSize: 5 * 1024,
      },
    );
  });

  it("rejects non-JSON responses", async () => {
    withPublicHttpFetchMock.mockImplementation(async (_url, _init, handler) =>
      handler(
        new Response("not JSON", {
          status: 200,
          headers: {
            "content-type": "text/plain",
          },
        }),
      ),
    );

    await expect(
      fetchMcpClientMetadataDocument("https://client.example/oauth/metadata.json"),
    ).rejects.toThrow("must be JSON");
  });

  it("rejects metadata documents larger than 5 KiB", async () => {
    withPublicHttpFetchMock.mockImplementation(async (_url, _init, handler) =>
      handler(
        new Response("x".repeat(5 * 1024 + 1), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    );

    await expect(
      fetchMcpClientMetadataDocument("https://client.example/oauth/metadata.json"),
    ).rejects.toThrow("Response too large");
  });
});

describe("resolveMcpClientMetadata", () => {
  it("resolves a valid HTTPS Client ID Metadata Document", async () => {
    const clientId = "https://client.example/oauth/metadata.json";
    const redirectUri = "http://localhost:3000/callback";
    const fetchDocument = vi.fn().mockResolvedValue({
      client_id: clientId,
      client_name: "Example MCP Client",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri,
      },
      {
        fetchDocument,
      },
    );

    expect(fetchDocument).toHaveBeenCalledWith(clientId);
    expect(result).toEqual({
      ok: true,
      value: {
        clientId,
        clientName: "Example MCP Client",
        redirectUris: [redirectUri],
      },
    });
  });

  it("rejects metadata whose client_id does not match the document URL", async () => {
    const clientId = "https://client.example/oauth/metadata.json";
    const redirectUri = "http://localhost:3000/callback";
    const fetchDocument = vi.fn().mockResolvedValue({
      client_id: "https://attacker.example/oauth/metadata.json",
      client_name: "Example MCP Client",
      redirect_uris: [redirectUri],
    });

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri,
      },
      {
        fetchDocument,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "client_id_mismatch",
      },
    });
  });

  it("rejects redirect URIs that are not an exact metadata match", async () => {
    const clientId = "https://client.example/oauth/metadata.json";
    const registeredRedirectUri = "http://localhost:3000/callback";
    const requestedRedirectUri = "http://localhost:3000/callback/attacker";

    const fetchDocument = vi.fn().mockResolvedValue({
      client_id: clientId,
      client_name: "Example MCP Client",
      redirect_uris: [registeredRedirectUri],
    });

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri: requestedRedirectUri,
      },
      {
        fetchDocument,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "redirect_uri_mismatch",
      },
    });
  });

  it("rejects non-HTTPS client IDs without fetching metadata", async () => {
    const clientId = "http://client.example/oauth/metadata.json";
    const redirectUri = "http://localhost:3000/callback";
    const fetchDocument = vi.fn();

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri,
      },
      {
        fetchDocument,
      },
    );

    expect(fetchDocument).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_client_id",
      },
    });
  });

  it.each([
    ["missing path", "https://client.example"],
    ["containing credentials", "https://user:password@client.example/oauth/metadata.json"],
    ["containing a fragment", "https://client.example/oauth/metadata.json#fragment"],
  ])("rejects client IDs %s without fetching metadata", async (_case, clientId) => {
    const fetchDocument = vi.fn();

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri: "http://localhost:3000/callback",
      },
      {
        fetchDocument,
      },
    );

    expect(fetchDocument).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_client_id",
      },
    });
  });

  it.each([
    [
      "missing client_name",
      {
        client_id: "https://client.example/oauth/metadata.json",
        redirect_uris: ["http://localhost:3000/callback"],
      },
    ],
    [
      "empty redirect_uris",
      {
        client_id: "https://client.example/oauth/metadata.json",
        client_name: "Example MCP Client",
        redirect_uris: [],
      },
    ],
    [
      "an invalid redirect URI",
      {
        client_id: "https://client.example/oauth/metadata.json",
        client_name: "Example MCP Client",
        redirect_uris: ["not-a-url"],
      },
    ],
  ])("rejects metadata with %s", async (_case, document) => {
    const clientId = "https://client.example/oauth/metadata.json";
    const fetchDocument = vi.fn().mockResolvedValue(document);

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri: "http://localhost:3000/callback",
      },
      {
        fetchDocument,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_client_metadata",
      },
    });
  });

  it("returns a controlled error when metadata fetching fails", async () => {
    const clientId = "https://client.example/oauth/metadata.json";
    const fetchDocument = vi.fn().mockRejectedValue(new Error("network failure"));

    const result = await resolveMcpClientMetadata(
      {
        clientId,
        redirectUri: "http://localhost:3000/callback",
      },
      {
        fetchDocument,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "metadata_fetch_failed",
      },
    });
  });
});
