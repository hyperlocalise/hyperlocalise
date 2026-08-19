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

import {
  formatGithubPushRangeLabel,
  isGithubNullOid,
  resolveGithubPullRequestNumber,
  resolveGithubPushRange,
  resolveGithubRepoLookbackHours,
  resolveGithubWorkflowTriggerBranch,
} from "./resolve-github-repo-lookback";

describe("resolveGithubPushRange", () => {
  it("reads the push commit range from the GitHub trigger snapshot", () => {
    expect(
      resolveGithubPushRange({
        triggerSource: "github",
        inputSnapshot: {
          pushBranch: "main",
          commitBefore: "aaa111",
          commitAfter: "bbb222",
        },
      }),
    ).toEqual({
      branch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });
  });

  it("treats a GitHub null OID as a new-branch push", () => {
    expect(isGithubNullOid("0000000000000000000000000000000000000000")).toBe(true);
    expect(
      resolveGithubPushRange({
        triggerSource: "github",
        inputSnapshot: {
          pushBranch: "feature/x",
          commitBefore: "0000000000000000000000000000000000000000",
          commitAfter: "ccc333",
        },
      }),
    ).toEqual({
      branch: "feature/x",
      commitBefore: null,
      commitAfter: "ccc333",
    });
    expect(
      formatGithubPushRangeLabel({
        branch: "feature/x",
        commitBefore: null,
        commitAfter: "ccc333",
      }),
    ).toContain("new branch");
  });

  it("ignores non-GitHub triggers", () => {
    expect(
      resolveGithubPushRange({
        triggerSource: "scheduled",
        inputSnapshot: {
          pushBranch: "main",
          commitAfter: "bbb222",
        },
      }),
    ).toBeNull();
  });

  it("prefers the pull request head branch for inspection", () => {
    expect(
      resolveGithubPushRange({
        triggerSource: "github",
        inputSnapshot: {
          pushBranch: "main",
          headBranch: "feature/review",
          commitBefore: "merge111",
          commitAfter: "bbb222",
        },
      }),
    ).toEqual({
      branch: "feature/review",
      commitBefore: "merge111",
      commitAfter: "bbb222",
    });
  });

  it("reads a pull request number from the GitHub trigger snapshot", () => {
    expect(resolveGithubPullRequestNumber({ pullRequestNumber: 42 })).toBe(42);
    expect(resolveGithubPullRequestNumber({ pullRequestNumber: 0 })).toBeNull();
    expect(resolveGithubPullRequestNumber({})).toBeNull();
  });

  it("uses the pull request base branch for GitHub workflow dispatch", () => {
    expect(
      resolveGithubWorkflowTriggerBranch({
        githubEvent: "pull_request",
        baseBranch: "main",
        pushBranch: "feature/review",
      }),
    ).toBe("main");
    expect(
      resolveGithubWorkflowTriggerBranch({
        pushBranch: "main",
      }),
    ).toBe("main");
  });
});

describe("resolveGithubRepoLookbackHours", () => {
  it("maps scheduled cadences onto lookback hours", () => {
    expect(
      resolveGithubRepoLookbackHours({
        triggerSource: "scheduled",
        automation: {
          triggerConfig: {
            mode: "scheduled",
            schedule: { cadence: "hourly", hourUtc: 0, timezone: "UTC" },
          },
        } as Parameters<typeof resolveGithubRepoLookbackHours>[0]["automation"],
      }),
    ).toBe(1);
    expect(
      resolveGithubRepoLookbackHours({
        triggerSource: "github",
        automation: {
          triggerConfig: { mode: "github", branches: ["main"] },
        } as Parameters<typeof resolveGithubRepoLookbackHours>[0]["automation"],
      }),
    ).toBe(24);
  });
});
