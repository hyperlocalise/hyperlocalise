/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  summarizeCommitResults,
  type GithubRepositoryAutomationCommitResultRecord,
} from "./github-repository-automation-commit-results";

function commitResult(
  status: GithubRepositoryAutomationCommitResultRecord["status"],
): GithubRepositoryAutomationCommitResultRecord {
  return {
    id: "result-1",
    jobId: "job-1",
    commitSha: "abc123",
    parentCommitSha: null,
    status,
    skipReason: null,
    changedPaths: [],
    hlCheckReport: null,
    agentSummary: null,
    suggestedFixes: null,
    logUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("summarizeCommitResults", () => {
  it("treats localization failed as blocking but not infrastructure error", () => {
    const summary = summarizeCommitResults([commitResult("error"), commitResult("passed")]);

    expect(summary.hasBlockingFailures).toBe(false);
    expect(summary.hasInfrastructureErrors).toBe(true);
  });

  it("flags localization failures as blocking", () => {
    const summary = summarizeCommitResults([commitResult("failed")]);

    expect(summary.hasBlockingFailures).toBe(true);
    expect(summary.hasInfrastructureErrors).toBe(false);
  });
});
