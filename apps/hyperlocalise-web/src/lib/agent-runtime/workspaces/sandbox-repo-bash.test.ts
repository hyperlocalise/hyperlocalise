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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const runCommand = vi.hoisted(() => vi.fn());
const readFile = vi.hoisted(() => vi.fn());
const writeFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  getVercelSandboxWorkspace: () => ({
    id: "sbx_test",
    runCommand,
    readFile,
    writeFile,
  }),
}));

import { hardenGitArgs } from "@/lib/agent-runtime/tools/workspace/git-harden";
import { GIT_METADATA_WRITE_ERROR } from "@/lib/agent-runtime/tools/workspace/path";
import { REPO_BASH_TIMEOUT_EXIT_CODE } from "@/lib/agent-runtime/tools/workspace/types";

import {
  createSandboxRepoBash,
  REPO_BASH_COMMAND_TIMEOUT_MS,
  REPO_BASH_HL_COMMAND_TIMEOUT_MS,
} from "./sandbox-repo-bash";

describe("createSandboxRepoBash", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("passes the git-hardened argv and the default command timeout", async () => {
    runCommand.mockResolvedValue({ exitCode: 0, output: "ok" });
    const bash = createSandboxRepoBash("sbx_test");

    await expect(bash.exec("git", { args: ["status"] })).resolves.toEqual({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      env: {},
    });

    expect(runCommand).toHaveBeenCalledWith("git", hardenGitArgs(["status"]), {
      timeoutMs: REPO_BASH_COMMAND_TIMEOUT_MS,
      signal: undefined,
    });
  });

  it("gives hl a longer timeout than other commands", async () => {
    runCommand.mockResolvedValue({ exitCode: 0, output: "" });
    const bash = createSandboxRepoBash("sbx_test");

    await bash.exec("hl", { args: ["check"] });
    expect(runCommand).toHaveBeenCalledWith("hl", ["check"], {
      timeoutMs: REPO_BASH_HL_COMMAND_TIMEOUT_MS,
      signal: undefined,
    });
  });

  it("maps a timeout throw to the shared timeout exit code", async () => {
    const now = { value: 1_000 };
    vi.spyOn(Date, "now").mockImplementation(() => now.value);
    runCommand.mockImplementation(async (_command, _args, options) => {
      now.value += options?.timeoutMs ?? 0;
      throw new Error("sandbox killed the command");
    });
    const bash = createSandboxRepoBash("sbx_test");

    await expect(bash.exec("cat", { args: ["README.md"] })).resolves.toEqual({
      exitCode: REPO_BASH_TIMEOUT_EXIT_CODE,
      stdout: "",
      stderr: "cat timed out after 120s and was stopped.",
      env: {},
    });
  });

  it("maps a non-zero exit after the timeout as a timeout, and rethrows earlier failures", async () => {
    const now = { value: 1_000 };
    vi.spyOn(Date, "now").mockImplementation(() => now.value);
    runCommand.mockImplementation(async () => {
      now.value += REPO_BASH_COMMAND_TIMEOUT_MS;
      return { exitCode: 1, output: "partial" };
    });
    const bash = createSandboxRepoBash("sbx_test");

    await expect(bash.exec("grep", { args: ["needle"] })).resolves.toEqual({
      exitCode: REPO_BASH_TIMEOUT_EXIT_CODE,
      stdout: "partial",
      stderr: "grep timed out after 120s and was stopped.",
      env: {},
    });

    now.value = 1_000;
    runCommand.mockImplementation(async () => {
      throw new Error("sandbox gone");
    });
    await expect(bash.exec("ls")).rejects.toThrow("sandbox gone");
  });

  it("does not treat an aborted command as a timeout", async () => {
    const now = { value: 1_000 };
    vi.spyOn(Date, "now").mockImplementation(() => now.value);
    const controller = new AbortController();
    runCommand.mockImplementation(async () => {
      now.value += REPO_BASH_COMMAND_TIMEOUT_MS;
      controller.abort();
      throw new Error("aborted");
    });
    const bash = createSandboxRepoBash("sbx_test");

    await expect(bash.exec("cat", { signal: controller.signal })).rejects.toThrow("aborted");
  });

  it("refuses writes under .git", async () => {
    const bash = createSandboxRepoBash("sbx_test");
    expect(bash.writeWorkspaceFile).toEqual(expect.any(Function));
    await expect(bash.writeWorkspaceFile!(".git/config", "x")).rejects.toThrow(
      GIT_METADATA_WRITE_ERROR,
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});
