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

export async function resolveGithubRepositoryAutomationCommitRange(
  job: GithubRepositoryAutomationJobWithRepository,
): Promise<{
  commitBefore: string | null;
  commitAfter: string;
}> {
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
