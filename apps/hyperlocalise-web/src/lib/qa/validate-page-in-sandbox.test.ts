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

const { createWorkspace } = vi.hoisted(() => ({ createWorkspace: vi.fn() }));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: createWorkspace,
}));

import { DEFAULT_QA_POLICY } from "./qa-policy";
import { QaCliUnavailableError, validateQaPageInSandbox } from "./validate-page-in-sandbox";

describe("validateQaPageInSandbox", () => {
  const writeFile = vi.fn();
  const runCommand = vi.fn();
  const readFile = vi.fn();
  const stop = vi.fn();
  const input = {
    policy: DEFAULT_QA_POLICY,
    glossaryTerms: [],
    acceptedWordsByLocale: {},
    segments: [
      {
        id: "0",
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "en.json",
        targetLocale: "fr-FR",
        maxLength: 0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createWorkspace.mockResolvedValue({
      id: "sbx_test",
      writeFile,
      runCommand,
      readFile,
      stop,
    });
    runCommand.mockResolvedValue({ exitCode: 0, output: "" });
    readFile.mockResolvedValue(JSON.stringify({ results: [{ id: "0", checks: [] }] }));
  });

  it("writes the captured policy and segments, then stops the sandbox", async () => {
    await expect(validateQaPageInSandbox(input)).resolves.toEqual([{ id: "0", checks: [] }]);
    expect(createWorkspace).toHaveBeenCalledWith({
      timeoutMs: 10 * 60 * 1000,
      imageScope: "qa",
      sandboxOptions: { snapshotExpiration: 0, keepLastSnapshots: { count: 1 } },
    });
    expect(runCommand).toHaveBeenCalledWith("bash", [
      "-lc",
      expect.stringMatching(/fetch-dictionaries\.sh/),
    ]);
    expect(writeFile).toHaveBeenCalledWith(
      ".hyperlocalise-qa/policy.json",
      expect.stringContaining('"version":1'),
    );
    expect(writeFile).toHaveBeenCalledWith(
      ".hyperlocalise-qa/segments.json",
      expect.stringContaining('"sourceText":"Hello"'),
    );
    expect(runCommand).toHaveBeenCalledWith("bash", ["-lc", "rm -rf .hyperlocalise-qa"]);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("classifies an old CLI and still stops the sandbox", async () => {
    runCommand.mockResolvedValueOnce({ exitCode: 1, output: "unknown command" });
    await expect(validateQaPageInSandbox(input)).rejects.toBeInstanceOf(QaCliUnavailableError);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("still stops the sandbox when a write fails", async () => {
    const error = Object.assign(new Error("Vercel sandbox command failed: bash"), {
      name: "VercelSandboxCommandError",
    });
    writeFile.mockRejectedValueOnce(error);
    await expect(validateQaPageInSandbox(input)).rejects.toBe(error);
    expect(stop).toHaveBeenCalledOnce();
  });
});
