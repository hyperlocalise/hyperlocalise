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
import { OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { discoverOAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { describe, expect, it } from "vite-plus/test";

import { GET } from "./route";
import { GET as GET_PATH_AWARE } from "./mcp/route";
import { GET as GET_LEGACY_PATH_AWARE } from "./mcp/sse/route";

describe("OAuth protected resource metadata route", () => {
  it("returns metadata for the hosted MCP endpoint", async () => {
    const response = GET(
      new Request("https://www.hyperlocalise.com/.well-known/oauth-protected-resource"),
    );

    expect(response.status).toBe(200);

    const metadata = OAuthProtectedResourceMetadataSchema.parse(await response.json());

    expect(metadata).toMatchObject({
      resource: "https://www.hyperlocalise.com/mcp",
      authorization_servers: ["https://www.hyperlocalise.com"],
      scopes_supported: ["mcp"],
    });
  });

  it("returns metadata from the endpoint-specific discovery URL", async () => {
    const response = GET_PATH_AWARE(
      new Request("https://www.hyperlocalise.com/.well-known/oauth-protected-resource/mcp"),
    );

    expect(response.status).toBe(200);

    const metadata = OAuthProtectedResourceMetadataSchema.parse(await response.json());

    expect(metadata).toMatchObject({
      resource: "https://www.hyperlocalise.com/mcp",
      authorization_servers: ["https://www.hyperlocalise.com"],
      scopes_supported: ["mcp"],
    });
  });

  it("keeps the legacy /mcp/sse discovery URL", async () => {
    const response = GET_LEGACY_PATH_AWARE(
      new Request("https://www.hyperlocalise.com/.well-known/oauth-protected-resource/mcp/sse"),
    );

    expect(response.status).toBe(200);

    const metadata = OAuthProtectedResourceMetadataSchema.parse(await response.json());

    expect(metadata).toMatchObject({
      resource: "https://www.hyperlocalise.com/mcp",
      authorization_servers: ["https://www.hyperlocalise.com"],
      scopes_supported: ["mcp"],
    });
  });

  it("supports MCP SDK path-aware discovery without fallback", async () => {
    const requestedUrls: string[] = [];

    const metadata = await discoverOAuthProtectedResourceMetadata(
      "https://www.hyperlocalise.com/mcp",
      undefined,
      async (input, init) => {
        const request = new Request(input, init);
        requestedUrls.push(request.url);

        if (new URL(request.url).pathname === "/.well-known/oauth-protected-resource/mcp") {
          return GET_PATH_AWARE(request);
        }

        return new Response(null, { status: 404 });
      },
    );

    expect(requestedUrls).toEqual([
      "https://www.hyperlocalise.com/.well-known/oauth-protected-resource/mcp",
    ]);
    expect(metadata.resource).toBe("https://www.hyperlocalise.com/mcp");
  });
});
