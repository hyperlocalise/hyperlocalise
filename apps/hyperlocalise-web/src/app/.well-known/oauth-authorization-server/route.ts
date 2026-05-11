import { NextResponse } from "next/server";

import { env } from "../../../lib/env";

export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin;
  const mcpEnabled = env.MCP_AUTH_ENABLED === "true";

  if (!mcpEnabled) {
    return NextResponse.json({ error: "mcp_disabled" }, { status: 503 });
  }

  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/token`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  });
}
