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

import { buildSemrushApiKeyAuthorizationHeader, SEMRUSH_MCP_URL } from "./constants";

describe("semrush constants", () => {
  it("builds the Semrush Apikey authorization header", () => {
    expect(buildSemrushApiKeyAuthorizationHeader("  abc123  ")).toBe("Apikey abc123");
  });

  it("points at the Semrush MCP HTTP endpoint", () => {
    expect(SEMRUSH_MCP_URL).toBe("https://mcp.semrush.com/v2/mcp");
  });
});
