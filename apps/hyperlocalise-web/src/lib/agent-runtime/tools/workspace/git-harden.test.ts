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

import { gitSubcommand } from "./git-exit";
import { hardenGitArgs } from "./git-harden";

describe("hardenGitArgs", () => {
  it("injects empty fsmonitor and diff.external overrides before status", () => {
    expect(hardenGitArgs(["status", "--short"])).toEqual([
      "-c",
      "core.fsmonitor=",
      "-c",
      "core.fsmonitorHook=",
      "-c",
      "diff.external=",
      "status",
      "--short",
    ]);
  });

  it("disables textconv and ext-diff on diff/show/log", () => {
    expect(hardenGitArgs(["diff", "HEAD^", "HEAD"])).toEqual([
      "-c",
      "core.fsmonitor=",
      "-c",
      "core.fsmonitorHook=",
      "-c",
      "diff.external=",
      "diff",
      "--no-textconv",
      "--no-ext-diff",
      "HEAD^",
      "HEAD",
    ]);
    expect(hardenGitArgs(["show", "HEAD:README.md"])).toEqual([
      "-c",
      "core.fsmonitor=",
      "-c",
      "core.fsmonitorHook=",
      "-c",
      "diff.external=",
      "show",
      "--no-textconv",
      "--no-ext-diff",
      "HEAD:README.md",
    ]);
  });

  it("disables textconv on blame without passing --no-ext-diff", () => {
    expect(hardenGitArgs(["blame", "--", "lang/en.json"])).toEqual([
      "-c",
      "core.fsmonitor=",
      "-c",
      "core.fsmonitorHook=",
      "-c",
      "diff.external=",
      "blame",
      "--no-textconv",
      "--",
      "lang/en.json",
    ]);
  });

  it("keeps -C before the config overrides", () => {
    expect(hardenGitArgs(["-C", "scribe-fe-v2", "status", "--porcelain"])).toEqual([
      "-C",
      "scribe-fe-v2",
      "-c",
      "core.fsmonitor=",
      "-c",
      "core.fsmonitorHook=",
      "-c",
      "diff.external=",
      "status",
      "--porcelain",
    ]);
  });

  it("still reports diff as the subcommand after hardening", () => {
    expect(gitSubcommand(hardenGitArgs(["-C", "repo", "diff", "HEAD"]))).toBe("diff");
    expect(gitSubcommand(hardenGitArgs(["status"]))).toBe("status");
  });
});
