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

import { gitSubcommand, isGitDiffCommand, isSuccessfulAllowlistedExit } from "./git-exit";

describe("git-exit", () => {
  it("finds the subcommand after git -C flags", () => {
    expect(gitSubcommand(["-C", "scribe-fe-v2", "diff", "HEAD^", "HEAD"])).toBe("diff");
    expect(gitSubcommand(["diff", "HEAD^", "HEAD"])).toBe("diff");
    expect(gitSubcommand(["-C", "repo", "--no-pager", "log"])).toBe("log");
  });

  it("finds the subcommand after -c config overrides", () => {
    expect(
      gitSubcommand(["-c", "core.fsmonitor=", "-c", "diff.external=", "status", "--short"]),
    ).toBe("status");
    expect(gitSubcommand(["-C", "repo", "-c", "core.fsmonitor=", "diff"])).toBe("diff");
    expect(gitSubcommand(["-ccore.fsmonitor=", "log"])).toBe("log");
  });

  it("treats git diff exit 0 and 1 as success", () => {
    expect(
      isSuccessfulAllowlistedExit({
        bin: "git",
        args: ["diff", "abc^..abc", "--", "file.json"],
        exitCode: 0,
      }),
    ).toBe(true);
    expect(
      isSuccessfulAllowlistedExit({
        bin: "git",
        args: ["-C", "scribe-fe-v2", "diff", "abc^..abc"],
        exitCode: 1,
      }),
    ).toBe(true);
    expect(
      isSuccessfulAllowlistedExit({
        bin: "git",
        args: ["diff", "abc^..abc"],
        exitCode: 2,
      }),
    ).toBe(false);
  });

  it("does not treat other git commands' exit 1 as success", () => {
    expect(
      isSuccessfulAllowlistedExit({
        bin: "git",
        args: ["log", "--oneline"],
        exitCode: 1,
      }),
    ).toBe(false);
    expect(isGitDiffCommand(["status"])).toBe(false);
  });
});
