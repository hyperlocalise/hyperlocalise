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
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";

import { buildSemrushApiKeyAuthorizationHeader, SEMRUSH_MCP_URL } from "./constants";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { SemrushConnectionError } from "./types";

export async function createSemrushMcpClient(input: {
  apiKey: string;
}): Promise<Result<MCPClient, SemrushConnectionError>> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return err({
      code: "semrush_api_key_required",
      message: "A Semrush API key is required.",
    });
  }

  try {
    const client = await createMCPClient({
      transport: {
        type: "http",
        url: SEMRUSH_MCP_URL,
        headers: {
          Authorization: buildSemrushApiKeyAuthorizationHeader(apiKey),
        },
      },
    });
    return ok(client);
  } catch (error) {
    return err({
      code: "semrush_connection_validation_failed",
      message:
        error instanceof Error ? error.message : "Unable to connect to the Semrush MCP server.",
    });
  }
}

export async function validateSemrushApiKey(input: {
  apiKey: string;
}): Promise<Result<{ toolCount: number }, SemrushConnectionError>> {
  const clientResult = await createSemrushMcpClient(input);
  if (isErr(clientResult)) {
    return clientResult;
  }

  const client = clientResult.value;
  try {
    const tools = await client.tools();
    return ok({ toolCount: Object.keys(tools).length });
  } catch (error) {
    return err({
      code: "semrush_connection_validation_failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to list tools from the Semrush MCP server.",
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}
