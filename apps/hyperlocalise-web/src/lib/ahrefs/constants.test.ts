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

import { AHREFS_MCP_URL, buildAhrefsApiKeyAuthorizationHeader } from "./constants";

describe("ahrefs constants", () => {
  it("builds the Ahrefs Bearer authorization header", () => {
    expect(buildAhrefsApiKeyAuthorizationHeader("  abc123  ")).toBe("Bearer abc123");
  });

  it("points at the Ahrefs MCP HTTP endpoint", () => {
    expect(AHREFS_MCP_URL).toBe("https://api.ahrefs.com/mcp/mcp");
  });
});
