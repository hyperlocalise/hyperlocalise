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

import {
  buildHyperlocaliseMcpUrl,
  buildMcpAgentSnippet,
  mcpAgentSnippetUsesShellPrompt,
} from "./overview-connect-agent";

const mcpUrl = "https://www.hyperlocalise.com/mcp/sse";

describe("overview connect agent helpers", () => {
  it("builds the public streamable HTTP MCP URL", () => {
    expect(buildHyperlocaliseMcpUrl("https://www.hyperlocalise.com")).toBe(mcpUrl);
  });

  it("builds the Claude install command", () => {
    expect(buildMcpAgentSnippet("claude", mcpUrl)).toBe(
      `claude mcp add -t http hyperlocalise ${mcpUrl}`,
    );
    expect(mcpAgentSnippetUsesShellPrompt("claude")).toBe(true);
  });

  it("builds the Codex install command", () => {
    expect(buildMcpAgentSnippet("codex", mcpUrl)).toBe(
      `codex mcp add hyperlocalise --url ${mcpUrl}`,
    );
  });

  it("builds Cursor mcp.json for the remote server", () => {
    expect(buildMcpAgentSnippet("cursor", mcpUrl)).toBe(`{
  "mcpServers": {
    "hyperlocalise": {
      "url": "${mcpUrl}"
    }
  }
}`);
    expect(mcpAgentSnippetUsesShellPrompt("cursor")).toBe(false);
  });
});
