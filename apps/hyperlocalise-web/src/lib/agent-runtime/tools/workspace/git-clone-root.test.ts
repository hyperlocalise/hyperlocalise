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
import { describe, expect, it } from "vite-plus/test";

import { resolveGitCloneRoot, toGitPath, toWorkspacePath, withGitRootArgs } from "./git-clone-root";
import type { RepoToolContext } from "./types";

const nested = { gitRoot: "scribe-fe-v2", repoDirName: "scribe-fe-v2" };
const cwdClone = { gitRoot: ".", repoDirName: "scribe-fe-v2" };

function createExecContext(exec: RepoToolContext["bash"]["exec"]): RepoToolContext {
  return {
    bash: {
      exec,
      readFile: async () => "",
    },
  };
}

describe("git-clone-root path helpers", () => {
  it("injects -C before git args when the clone is nested", () => {
    expect(withGitRootArgs("scribe-fe-v2", ["log", "-1"])).toEqual([
      "-C",
      "scribe-fe-v2",
      "log",
      "-1",
    ]);
    expect(withGitRootArgs(".", ["log", "-1"])).toEqual(["log", "-1"]);
  });

  it("strips a repo-name or clone-root prefix from paths", () => {
    expect(toGitPath("scribe-fe-v2/src/locales/en/messages.json", nested)).toBe(
      "src/locales/en/messages.json",
    );
    expect(toGitPath("scribe-fe-v2/src/locales/en/messages.json", cwdClone)).toBe(
      "src/locales/en/messages.json",
    );
    expect(toGitPath("src/locales/en/messages.json", nested)).toBe("src/locales/en/messages.json");
  });

  it("maps git paths back to workspace-relative paths", () => {
    expect(toWorkspacePath("src/locales/en/common.json", nested)).toBe(
      "scribe-fe-v2/src/locales/en/common.json",
    );
    expect(toWorkspacePath("src/locales/en/common.json", cwdClone)).toBe(
      "src/locales/en/common.json",
    );
  });
});

describe("resolveGitCloneRoot", () => {
  it("uses the sandbox cwd when it is already a git work tree", async () => {
    const ctx = createExecContext(async (command, options) => {
      const args = options?.args ?? [];
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
        return { stdout: "true\n", stderr: "", exitCode: 0, env: {} };
      }
      if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
        return {
          stdout: "/home/user/project/scribe-fe-v2\n",
          stderr: "",
          exitCode: 0,
          env: {},
        };
      }
      return { stdout: "", stderr: "", exitCode: 1, env: {} };
    });

    await expect(resolveGitCloneRoot(ctx)).resolves.toEqual({
      gitRoot: ".",
      repoDirName: "scribe-fe-v2",
    });
  });

  it("selects a nested clone when exactly one git directory exists", async () => {
    const ctx = createExecContext(async (command, options) => {
      const args = options?.args ?? [];
      if (command === "git" && args[0] === "rev-parse") {
        return { stdout: "", stderr: "fatal: not a git repository", exitCode: 128, env: {} };
      }
      if (command === "ls") {
        return { stdout: "scribe-fe-v2\nREADME.md\n", stderr: "", exitCode: 0, env: {} };
      }
      if (command === "test" && args[0] === "-d" && args[1] === "scribe-fe-v2") {
        return { stdout: "", stderr: "", exitCode: 0, env: {} };
      }
      if (
        command === "git" &&
        args[0] === "-C" &&
        args[1] === "scribe-fe-v2" &&
        args[2] === "rev-parse"
      ) {
        return { stdout: "true\n", stderr: "", exitCode: 0, env: {} };
      }
      return { stdout: "", stderr: "", exitCode: 1, env: {} };
    });

    await expect(resolveGitCloneRoot(ctx)).resolves.toEqual({
      gitRoot: "scribe-fe-v2",
      repoDirName: "scribe-fe-v2",
    });
  });

  it("falls back to cwd when more than one nested git directory exists", async () => {
    const ctx = createExecContext(async (command, options) => {
      const args = options?.args ?? [];
      if (command === "git" && args[0] === "rev-parse") {
        return { stdout: "", stderr: "fatal: not a git repository", exitCode: 128, env: {} };
      }
      if (command === "ls") {
        return { stdout: "repo-a\nrepo-b\n", stderr: "", exitCode: 0, env: {} };
      }
      if (command === "test") {
        return { stdout: "", stderr: "", exitCode: 0, env: {} };
      }
      if (command === "git" && args[0] === "-C") {
        return { stdout: "true\n", stderr: "", exitCode: 0, env: {} };
      }
      return { stdout: "", stderr: "", exitCode: 1, env: {} };
    });

    await expect(resolveGitCloneRoot(ctx)).resolves.toEqual({
      gitRoot: ".",
      repoDirName: null,
    });
  });
});
