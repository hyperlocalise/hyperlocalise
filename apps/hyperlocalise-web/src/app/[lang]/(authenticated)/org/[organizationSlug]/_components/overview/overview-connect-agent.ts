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

export const HYPERLOCALISE_MCP_SERVER_NAME = "hyperlocalise";
export const HYPERLOCALISE_MCP_RESOURCE_PATH = "/mcp/sse";

export const mcpAgentClientIds = ["claude", "codex", "cursor"] as const;

export type McpAgentClient = (typeof mcpAgentClientIds)[number];

export const mcpClientSetupGuideUrls = {
  claude: "https://code.claude.com/docs/en/mcp-quickstart",
  codex: "https://developers.openai.com/codex/mcp",
  cursor: "https://cursor.com/docs/context/mcp",
} as const satisfies Record<McpAgentClient, string>;

export function buildHyperlocaliseMcpUrl(origin: string) {
  return new URL(HYPERLOCALISE_MCP_RESOURCE_PATH, origin).toString();
}

export function buildMcpAgentSnippet(client: McpAgentClient, mcpUrl: string) {
  switch (client) {
    case "claude":
      return `claude mcp add -t http ${HYPERLOCALISE_MCP_SERVER_NAME} ${mcpUrl}`;
    case "codex":
      return `codex mcp add ${HYPERLOCALISE_MCP_SERVER_NAME} --url ${mcpUrl}`;
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            [HYPERLOCALISE_MCP_SERVER_NAME]: {
              url: mcpUrl,
            },
          },
        },
        null,
        2,
      );
    default: {
      const _exhaustive: never = client;
      return _exhaustive;
    }
  }
}

export function mcpAgentSnippetUsesShellPrompt(client: McpAgentClient) {
  return client !== "cursor";
}
