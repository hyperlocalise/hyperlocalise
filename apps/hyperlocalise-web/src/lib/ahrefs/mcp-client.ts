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
  AHREFS_MCP_CONNECT_TIMEOUT_MS,
  AHREFS_MCP_URL,
  buildAhrefsApiKeyAuthorizationHeader,
} from "./constants";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { AhrefsConnectionError } from "./types";

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

export async function createAhrefsMcpClient(input: {
  apiKey: string;
  /**
   * Bounds the initial MCP client handshake. Defaults to the connect timeout.
   * Does not control later tool-call HTTP requests when `getRequestSignal` is set.
   */
  signal?: AbortSignal;
  /**
   * Signal used for each MCP HTTP request (including connect and later tool calls).
   * Callers that need a short discovery budget and a longer execution budget should
   * return a connect signal first, then switch to an execution signal after `tools()`.
   */
  getRequestSignal?: () => AbortSignal;
}): Promise<Result<MCPClient, AhrefsConnectionError>> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return err({
      code: "ahrefs_api_key_required",
      message: "An Ahrefs MCP API key is required.",
    });
  }

  const connectSignal = input.signal ?? AbortSignal.timeout(AHREFS_MCP_CONNECT_TIMEOUT_MS);
  const getRequestSignal = input.getRequestSignal ?? (() => connectSignal);

  try {
    const client = await withDeadline(
      createMCPClient({
        transport: {
          type: "http",
          url: AHREFS_MCP_URL,
          headers: {
            Authorization: buildAhrefsApiKeyAuthorizationHeader(apiKey),
          },
          fetch: (url, init) =>
            fetch(url, {
              ...init,
              signal: getRequestSignal(),
            }),
        },
      }),
      connectSignal,
      "Timed out connecting to the Ahrefs MCP server.",
    );
    return ok(client);
  } catch (error) {
    if (isAbortError(error) || (error instanceof Error && error.message.includes("Timed out"))) {
      return err({
        code: "ahrefs_mcp_timeout",
        message: "Timed out connecting to the Ahrefs MCP server.",
      });
    }
    return err({
      code: "ahrefs_connection_validation_failed",
      message:
        error instanceof Error ? error.message : "Unable to connect to the Ahrefs MCP server.",
    });
  }
}

export async function listAhrefsMcpTools(input: {
  client: MCPClient;
  signal?: AbortSignal;
}): Promise<Result<Awaited<ReturnType<MCPClient["tools"]>>, AhrefsConnectionError>> {
  const signal = input.signal ?? AbortSignal.timeout(AHREFS_MCP_CONNECT_TIMEOUT_MS);

  try {
    const tools = await withDeadline(
      input.client.tools(),
      signal,
      "Timed out listing tools from the Ahrefs MCP server.",
    );
    return ok(tools);
  } catch (error) {
    if (isAbortError(error) || (error instanceof Error && error.message.includes("Timed out"))) {
      return err({
        code: "ahrefs_mcp_timeout",
        message: "Timed out listing tools from the Ahrefs MCP server.",
      });
    }
    return err({
      code: "ahrefs_connection_validation_failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to list tools from the Ahrefs MCP server.",
    });
  }
}

export async function validateAhrefsApiKey(input: {
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Result<{ toolCount: number }, AhrefsConnectionError>> {
  const signal = input.signal ?? AbortSignal.timeout(AHREFS_MCP_CONNECT_TIMEOUT_MS);
  const clientResult = await createAhrefsMcpClient({
    apiKey: input.apiKey,
    signal,
  });
  if (isErr(clientResult)) {
    return clientResult;
  }

  const client = clientResult.value;
  try {
    const toolsResult = await listAhrefsMcpTools({ client, signal });
    if (isErr(toolsResult)) {
      return toolsResult;
    }
    return ok({ toolCount: Object.keys(toolsResult.value).length });
  } finally {
    await client.close().catch(() => undefined);
  }
}
