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

import {
  buildSemrushApiKeyAuthorizationHeader,
  SEMRUSH_MCP_CONNECT_TIMEOUT_MS,
  SEMRUSH_MCP_URL,
} from "./constants";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { SemrushConnectionError } from "./types";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "TimeoutError")
  );
}

async function withDeadline<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMessage: string,
): Promise<T> {
  if (signal.aborted) {
    throw new Error(timeoutMessage);
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error(timeoutMessage));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export async function createSemrushMcpClient(input: {
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Result<MCPClient, SemrushConnectionError>> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return err({
      code: "semrush_api_key_required",
      message: "A Semrush API key is required.",
    });
  }

  const signal = input.signal ?? AbortSignal.timeout(SEMRUSH_MCP_CONNECT_TIMEOUT_MS);

  try {
    const client = await withDeadline(
      createMCPClient({
        transport: {
          type: "http",
          url: SEMRUSH_MCP_URL,
          headers: {
            Authorization: buildSemrushApiKeyAuthorizationHeader(apiKey),
          },
          fetch: (url, init) =>
            fetch(url, {
              ...init,
              signal,
            }),
        },
      }),
      signal,
      "Timed out connecting to the Semrush MCP server.",
    );
    return ok(client);
  } catch (error) {
    if (isAbortError(error) || (error instanceof Error && error.message.includes("Timed out"))) {
      return err({
        code: "semrush_mcp_timeout",
        message: "Timed out connecting to the Semrush MCP server.",
      });
    }
    return err({
      code: "semrush_connection_validation_failed",
      message:
        error instanceof Error ? error.message : "Unable to connect to the Semrush MCP server.",
    });
  }
}

export async function listSemrushMcpTools(input: {
  client: MCPClient;
  signal?: AbortSignal;
}): Promise<Result<Awaited<ReturnType<MCPClient["tools"]>>, SemrushConnectionError>> {
  const signal = input.signal ?? AbortSignal.timeout(SEMRUSH_MCP_CONNECT_TIMEOUT_MS);

  try {
    const tools = await withDeadline(
      input.client.tools(),
      signal,
      "Timed out listing tools from the Semrush MCP server.",
    );
    return ok(tools);
  } catch (error) {
    if (isAbortError(error) || (error instanceof Error && error.message.includes("Timed out"))) {
      return err({
        code: "semrush_mcp_timeout",
        message: "Timed out listing tools from the Semrush MCP server.",
      });
    }
    return err({
      code: "semrush_connection_validation_failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to list tools from the Semrush MCP server.",
    });
  }
}

export async function validateSemrushApiKey(input: {
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Result<{ toolCount: number }, SemrushConnectionError>> {
  const signal = input.signal ?? AbortSignal.timeout(SEMRUSH_MCP_CONNECT_TIMEOUT_MS);
  const clientResult = await createSemrushMcpClient({
    apiKey: input.apiKey,
    signal,
  });
  if (isErr(clientResult)) {
    return clientResult;
  }

  const client = clientResult.value;
  try {
    const toolsResult = await listSemrushMcpTools({ client, signal });
    if (isErr(toolsResult)) {
      return toolsResult;
    }
    return ok({ toolCount: Object.keys(toolsResult.value).length });
  } finally {
    await client.close().catch(() => undefined);
  }
}
