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
import { describe, expect, it } from "vite-plus/test";

import { GET } from "./route";

describe("public API OAuth protected resource metadata", () => {
  it("points authorization_servers at AuthKit and leaves MCP metadata elsewhere", async () => {
    const response = GET(
      new Request("https://www.hyperlocalise.com/.well-known/oauth-protected-resource/api/v1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://www.hyperlocalise.com/api/v1",
      authorization_servers: ["https://authkit.test"],
      scopes_supported: ["jobs:read", "jobs:write", "files:read", "files:write", "mcp"],
    });
  });
});
