import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { mcpServer } from "./mcp-server";

export const mcpTransport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

// Connect server to transport once at module load.
// In serverless environments each instance gets its own pair,
// which is acceptable because the transport operates in stateless mode.
mcpServer.connect(mcpTransport).catch((err) => {
  console.error("Failed to connect MCP server to transport:", err);
});
