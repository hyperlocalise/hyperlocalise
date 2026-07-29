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

import { AHREFS_MCP_URL } from "./constants";
import { createAhrefsMcpClient, listAhrefsMcpTools, validateAhrefsApiKey } from "./mcp-client";

const mocks = vi.hoisted(() => ({
  createMCPClient: vi.fn(),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: mocks.createMCPClient,
}));

describe("ahrefs mcp-client", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects blank API keys before opening an MCP client", async () => {
    const result = await createAhrefsMcpClient({ apiKey: "   " });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "ahrefs_api_key_required",
        message: "An Ahrefs MCP API key is required.",
      });
    }
    expect(mocks.createMCPClient).not.toHaveBeenCalled();
  });

  it("maps pre-aborted connect signals to ahrefs_mcp_timeout", async () => {
    mocks.createMCPClient.mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();
    controller.abort();

    const result = await createAhrefsMcpClient({
      apiKey: "ahrefs-key",
      signal: controller.signal,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("ahrefs_mcp_timeout");
      expect(result.error.message).toBe("Timed out connecting to the Ahrefs MCP server.");
    }
  });

  it("maps AbortError from createMCPClient to ahrefs_mcp_timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mocks.createMCPClient.mockRejectedValue(abortError);

    const result = await createAhrefsMcpClient({ apiKey: "ahrefs-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("ahrefs_mcp_timeout");
    }
  });

  it("maps TimeoutError-shaped failures to ahrefs_mcp_timeout", async () => {
    mocks.createMCPClient.mockRejectedValue({ name: "TimeoutError" });

    const result = await createAhrefsMcpClient({ apiKey: "ahrefs-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("ahrefs_mcp_timeout");
    }
  });

  it("maps non-timeout connect failures to ahrefs_connection_validation_failed", async () => {
    mocks.createMCPClient.mockRejectedValue(new Error("upstream 401"));

    const result = await createAhrefsMcpClient({ apiKey: "ahrefs-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({
        code: "ahrefs_connection_validation_failed",
        message: "upstream 401",
      });
    }
  });

  it("creates an HTTP MCP client with the trimmed Bearer key", async () => {
    const client = { tools: vi.fn(), close: vi.fn() };
    mocks.createMCPClient.mockResolvedValue(client);

    const result = await createAhrefsMcpClient({ apiKey: "  secret-key  " });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(client);
    }
    expect(mocks.createMCPClient).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          type: "http",
          url: AHREFS_MCP_URL,
          headers: {
            Authorization: "Bearer secret-key",
          },
        }),
      }),
    );
  });

  it("lists tools and maps list timeouts", async () => {
    const tools = { siteExplorer: {} };
    const client = {
      tools: vi.fn().mockResolvedValue(tools),
      close: vi.fn(),
    };

    const listed = await listAhrefsMcpTools({ client: client as never });
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.value).toBe(tools);
    }

    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    client.tools.mockRejectedValue(abortError);
    const timedOut = await listAhrefsMcpTools({ client: client as never });
    expect(isErr(timedOut)).toBe(true);
    if (isErr(timedOut)) {
      expect(timedOut.error.code).toBe("ahrefs_mcp_timeout");
      expect(timedOut.error.message).toBe("Timed out listing tools from the Ahrefs MCP server.");
    }
  });

  it("validateAhrefsApiKey returns tool counts and always closes the client", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const client = {
      tools: vi.fn().mockResolvedValue({ a: {}, b: {} }),
      close,
    };
    mocks.createMCPClient.mockResolvedValue(client);

    const result = await validateAhrefsApiKey({ apiKey: "ahrefs-key" });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ toolCount: 2 });
    }
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("validateAhrefsApiKey closes the client when tool listing fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const client = {
      tools: vi.fn().mockRejectedValue(abortError),
      close,
    };
    mocks.createMCPClient.mockResolvedValue(client);

    const result = await validateAhrefsApiKey({ apiKey: "ahrefs-key" });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("ahrefs_mcp_timeout");
    }
    expect(close).toHaveBeenCalledTimes(1);
  });
});
