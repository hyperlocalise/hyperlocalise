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
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

import {
  buildSandboxWriteFileScript,
  SANDBOX_WRITE_OUTSIDE_WORKSPACE,
  SANDBOX_WRITE_SYMLINK_DENIED,
  VercelSandboxCommandError,
  VercelSandboxRuntime,
} from "./vercel-sandbox-runtime";
import { serializeErrorForLog } from "@/lib/serialize-error-for-log";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

async function createWorkspaceRoot() {
  const root = await mkdtemp(join(tmpdir(), "sandbox-write-guard-"));
  tempRoots.push(root);
  return root;
}

async function runWriteGuard(cwd: string, path: string, content: string) {
  const script = buildSandboxWriteFileScript(path, Buffer.from(content).toString("base64"));
  try {
    await execFileAsync("bash", ["-c", script], { cwd });
    return { exitCode: 0 };
  } catch (error) {
    const failed = error as { code?: number | string; status?: number };
    if (typeof failed.status === "number") {
      return { exitCode: failed.status };
    }
    if (typeof failed.code === "number") {
      return { exitCode: failed.code };
    }
    return { exitCode: 1 };
  }
}

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

  it("reads files via binary buffer so Vietnamese UTF-8 is preserved", async () => {
    const vietnamese = "Tìm hiểu thêm về{0}";
    const resolvedPath = "/vercel/sandbox/lang/vi-VN.json";
    const output = vi.fn().mockResolvedValue(resolvedPath);
    const readFileToBuffer = vi.fn().mockResolvedValue(Buffer.from(vietnamese, "utf8"));
    sandboxMocks.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      output,
    });
    sandboxMocks.get
      .mockResolvedValueOnce({
        runCommand: sandboxMocks.runCommand,
      })
      .mockResolvedValueOnce({
        readFileToBuffer,
      });

    const runtime = new VercelSandboxRuntime("sbx_123");
    await expect(runtime.readFile("lang/vi-VN.json")).resolves.toBe(vietnamese);

    expect(readFileToBuffer).toHaveBeenCalledWith({ path: resolvedPath });
    expect(sandboxMocks.runCommand).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["-lc", expect.stringContaining(`printf '%s' "$resolved"`)]),
    );
  });

  it("maps symlink and outside-workspace write denials from the sandbox guard", async () => {
    sandboxMocks.runCommand
      .mockResolvedValueOnce({
        exitCode: SANDBOX_WRITE_SYMLINK_DENIED,
        output: async () => "",
      })
      .mockResolvedValueOnce({
        exitCode: SANDBOX_WRITE_OUTSIDE_WORKSPACE,
        output: async () => "",
      });
    sandboxMocks.get
      .mockResolvedValueOnce({
        runCommand: sandboxMocks.runCommand,
      })
      .mockResolvedValueOnce({
        runCommand: sandboxMocks.runCommand,
      });

    const runtime = new VercelSandboxRuntime("sbx_123");
    await expect(runtime.writeFile("playwright", "pwned")).rejects.toThrow(
      "Symlink writes are not allowed.",
    );
    await expect(runtime.writeFile("../outside.txt", "pwned")).rejects.toThrow(
      "Path resolves outside the workspace.",
    );
    expect(sandboxMocks.runCommand).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["-lc", expect.stringContaining("realpath -m")]),
    );
  });
});

describe("buildSandboxWriteFileScript", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
    );
  });

  it("writes a new file inside the workspace root", async () => {
    const root = await createWorkspaceRoot();
    await mkdir(join(root, "src"), { recursive: true });

    await expect(runWriteGuard(root, "src/mock.tsx", "export const value = 1;\n")).resolves.toEqual(
      {
        exitCode: 0,
      },
    );
    await expect(readFile(join(root, "src/mock.tsx"), "utf8")).resolves.toBe(
      "export const value = 1;\n",
    );
  });

  it("refuses to follow a planted leaf symlink out of the workspace", async () => {
    const root = await createWorkspaceRoot();
    const outsideDir = await mkdtemp(join(tmpdir(), "sandbox-write-outside-"));
    tempRoots.push(outsideDir);
    const outsideFile = join(outsideDir, "playwright.js");
    await writeFile(outsideFile, "original");
    await symlink(outsideFile, join(root, "playwright"));

    await expect(runWriteGuard(root, "playwright", "pwned")).resolves.toEqual({
      exitCode: SANDBOX_WRITE_SYMLINK_DENIED,
    });
    await expect(readFile(outsideFile, "utf8")).resolves.toBe("original");
  });

  it("refuses to follow a parent-directory symlink out of the workspace", async () => {
    const root = await createWorkspaceRoot();
    const outsideDir = await mkdtemp(join(tmpdir(), "hyperlocalise-browser-runtime-"));
    tempRoots.push(outsideDir);
    await mkdir(join(outsideDir, "node_modules", "playwright"), { recursive: true });
    await writeFile(join(outsideDir, "node_modules", "playwright", "index.js"), "original");
    await symlink(outsideDir, join(root, "runtime"));

    await expect(
      runWriteGuard(root, "runtime/node_modules/playwright/index.js", "pwned"),
    ).resolves.toEqual({
      exitCode: SANDBOX_WRITE_OUTSIDE_WORKSPACE,
    });
    await expect(
      readFile(join(outsideDir, "node_modules", "playwright", "index.js"), "utf8"),
    ).resolves.toBe("original");
  });

  it("rejects path traversal even when no symlink is present", async () => {
    const root = await createWorkspaceRoot();
    const escapeName = `sandbox-write-escape-${Date.now()}.txt`;
    const outsideFile = join(root, "..", escapeName);

    await expect(runWriteGuard(root, `../${escapeName}`, "pwned")).resolves.toEqual({
      exitCode: SANDBOX_WRITE_OUTSIDE_WORKSPACE,
    });
    await rm(outsideFile, { force: true });
  });
});
