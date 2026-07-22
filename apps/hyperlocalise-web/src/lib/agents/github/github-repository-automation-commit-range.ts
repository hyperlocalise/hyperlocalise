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
import type { GithubRepositoryAutomationJobWithRepository } from "./github-repository-automation-jobs";
import { findLatestSucceededCommitAfter } from "./github-repository-automation-jobs";
import { resolveDefaultBranchHeadSha } from "./github-repository-automation-sandbox";

function parseRepositoryOwnerRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error("invalid repository full name");
  }
  return { owner, repo };
}

export type GithubRepositoryAutomationCommitRange = {
  commitBefore: string | null;
  commitAfter: string;
};

export async function resolveGithubRepositoryAutomationCommitRange(
  job: GithubRepositoryAutomationJobWithRepository,
): Promise<GithubRepositoryAutomationCommitRange> {
  if (job.commitAfter) {
    return {
      commitBefore: job.commitBefore,
      commitAfter: job.commitAfter,
    };
  }

  const branch = job.triggerBranch ?? job.defaultBranch;
  if (!branch) {
    throw new Error("github_repository_automation_branch_not_resolved");
  }

  const { owner, repo } = parseRepositoryOwnerRepo(job.repositoryFullName);
  const head = await resolveDefaultBranchHeadSha({
    installationId: job.githubInstallationId,
    owner,
    repo,
    branch,
  });

  const previousCommit = await findLatestSucceededCommitAfter({
    githubInstallationRepositoryId: job.githubInstallationRepositoryId,
    triggerBranch: branch,
  });

  return {
    commitBefore: previousCommit,
    commitAfter: head.sha,
  };
}
