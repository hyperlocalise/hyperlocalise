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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { SEMRUSH_MCP_URL } from "./constants";
import { createSemrushMcpClient, listSemrushMcpTools, validateSemrushApiKey } from "./mcp-client";

const mocks = vi.hoisted(() => ({
  createMCPClient: vi.fn(),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: mocks.createMCPClient,
}));

describe("semrush mcp-client", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects blank API keys before opening an MCP client", async () => {
    const result = await createSemrushMcpClient({ apiKey: "\t  " });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "semrush_api_key_required",
        message: "A Semrush API key is required.",
      });
    }
    expect(mocks.createMCPClient).not.toHaveBeenCalled();
  });

  it("maps pre-aborted connect signals to semrush_mcp_timeout", async () => {
    mocks.createMCPClient.mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();
    controller.abort();

    const result = await createSemrushMcpClient({
      apiKey: "semrush-key",
      signal: controller.signal,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("semrush_mcp_timeout");
      expect(result.error.message).toBe("Timed out connecting to the Semrush MCP server.");
    }
  });

  it("maps AbortError from createMCPClient to semrush_mcp_timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mocks.createMCPClient.mockRejectedValue(abortError);

    const result = await createSemrushMcpClient({ apiKey: "semrush-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("semrush_mcp_timeout");
    }
  });

  it("maps TimeoutError-shaped failures to semrush_mcp_timeout", async () => {
    mocks.createMCPClient.mockRejectedValue({ name: "TimeoutError" });

    const result = await createSemrushMcpClient({ apiKey: "semrush-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("semrush_mcp_timeout");
    }
  });

  it("maps non-timeout connect failures to semrush_connection_validation_failed", async () => {
    mocks.createMCPClient.mockRejectedValue(new Error("upstream 403"));

    const result = await createSemrushMcpClient({ apiKey: "semrush-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "semrush_connection_validation_failed",
        message: "upstream 403",
      });
    }
  });

  it("creates an HTTP MCP client with the trimmed Bearer key", async () => {
    const client = { tools: vi.fn(), close: vi.fn() };
    mocks.createMCPClient.mockResolvedValue(client);

    const result = await createSemrushMcpClient({ apiKey: "  secret-key  " });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(client);
    }
    expect(mocks.createMCPClient).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          type: "http",
          url: SEMRUSH_MCP_URL,
          headers: {
            Authorization: "Apikey secret-key",
          },
        }),
      }),
    );
  });

  it("lists tools and maps list timeouts", async () => {
    const tools = { keywordOverview: {} };
    const client = {
      tools: vi.fn().mockResolvedValue(tools),
      close: vi.fn(),
    };

    const listed = await listSemrushMcpTools({ client: client as never });
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.value).toBe(tools);
    }

    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    client.tools.mockRejectedValue(abortError);
    const timedOut = await listSemrushMcpTools({ client: client as never });
    expect(isErr(timedOut)).toBe(true);
    if (isErr(timedOut)) {
      expect(timedOut.error.code).toBe("semrush_mcp_timeout");
      expect(timedOut.error.message).toBe("Timed out listing tools from the Semrush MCP server.");
    }
  });

  it("validateSemrushApiKey returns tool counts and always closes the client", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const client = {
      tools: vi.fn().mockResolvedValue({ a: {}, b: {}, c: {} }),
      close,
    };
    mocks.createMCPClient.mockResolvedValue(client);

    const result = await validateSemrushApiKey({ apiKey: "semrush-key" });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ toolCount: 3 });
    }
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("validateSemrushApiKey closes the client when tool listing fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const client = {
      tools: vi.fn().mockRejectedValue(abortError),
      close,
    };
    mocks.createMCPClient.mockResolvedValue(client);

    const result = await validateSemrushApiKey({ apiKey: "semrush-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("semrush_mcp_timeout");
    }
    expect(close).toHaveBeenCalledTimes(1);
  });
});
