import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const sandboxMocks = vi.hoisted(() => {
  const get = vi.fn();
  const runCommand = vi.fn();

  return { get, runCommand };
});

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: sandboxMocks.get,
  },
}));

import { VercelSandboxCommandError, VercelSandboxRuntime } from "./vercel-sandbox-runtime";
import { serializeErrorForLog } from "@/lib/serialize-error-for-log";

describe("VercelSandboxRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps sandbox command API failures with debuggable context", async () => {
    const apiError = Object.assign(new Error("Status code 400 is not ok"), {
      response: {
        status: 400,
        statusText: "Bad Request",
        url: "https://vercel.com/api/v2/sandboxes/sessions/sbx_123/cmd?teamId=team_123",
      },
      json: {
        error: {
          code: "bad_request",
          message: "Invalid command payload",
          requestId: "req_123",
        },
      },
    });

    sandboxMocks.runCommand.mockRejectedValueOnce(apiError);
    sandboxMocks.get.mockResolvedValueOnce({
      runCommand: sandboxMocks.runCommand,
    });

    const runtime = new VercelSandboxRuntime("sbx_123");

    try {
      await runtime.runCommand("rg", [
        "--vimgrep",
        "--glob=*.tsx",
        "--glob",
        "!node_modules/**",
        "Dashboard",
        ".",
      ]);
      throw new Error("Expected runCommand to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(VercelSandboxCommandError);
      const serialized = serializeErrorForLog(error);
      expect(serialized).toMatchObject({
        name: "VercelSandboxCommandError",
        sandboxId: "sbx_123",
        command: "rg",
        argCount: 6,
        argFlags: ["--vimgrep", "--glob"],
        responseStatus: 400,
        responseStatusText: "Bad Request",
        responseUrl: "https://vercel.com/api/v2/sandboxes/sessions/sbx_123/cmd?teamId=team_123",
        providerErrorCode: "bad_request",
        providerErrorMessage: "Invalid command payload",
        providerRequestId: "req_123",
      });
    }
  });
});
