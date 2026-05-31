import type {
  RepositoryAgentActor,
  RepositoryAgentTaskSource,
  RepositoryAgentWorkMode,
} from "@/lib/agent-contracts/repository-task";

export {
  checkRepositoryWriteGate,
  type WriteAction,
  type WriteGateResult,
} from "@/lib/agent-contracts/write-gate";

/**
 * Check whether the GitHub App installation can push to a repository.
 */
export async function canPushToGitHubRepository(input: {
  installationId: number;
  repositoryFullName: string;
}): Promise<{ canPush: boolean; reason?: string }> {
  const { getInstallationOctokit } = await import("@/lib/agents/github/app");

  try {
    const octokit = await getInstallationOctokit(input.installationId);
    const [owner, repo] = input.repositoryFullName.split("/");
    if (!owner || !repo) {
      return { canPush: false, reason: "Invalid repository full name." };
    }

    const { data: repository } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    const hasPushAccess = repository.permissions?.push === true;
    if (!hasPushAccess) {
      return {
        canPush: false,
        reason: "The GitHub App installation does not have push access to this repository.",
      };
    }

    return { canPush: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      canPush: false,
      reason: `Could not verify push permission: ${message}`,
    };
  }
}

/**
 * Check whether the GitHub App installation can push to the PR branch.
 */
export async function canPushToGitHubBranch(input: {
  installationId: number;
  repositoryFullName: string;
  branch: string;
}): Promise<{ canPush: boolean; reason?: string }> {
  const { getInstallationOctokit } = await import("@/lib/agents/github/app");

  try {
    const repositoryPush = await canPushToGitHubRepository(input);
    if (!repositoryPush.canPush) {
      return repositoryPush;
    }

    const octokit = await getInstallationOctokit(input.installationId);
    const [owner, repo] = input.repositoryFullName.split("/");
    if (!owner || !repo) {
      return { canPush: false, reason: "Invalid repository full name." };
    }

    const { data: branch } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: input.branch,
    });

    if (branch.protected) {
      return {
        canPush: false,
        reason: `Branch ${input.branch} is protected. Push changes through the repository's required review flow.`,
      };
    }

    return { canPush: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      canPush: false,
      reason: `Could not verify push permission: ${message}`,
    };
  }
}

// Re-exported for adapters that assemble write-gate inputs from task payloads.
export type { RepositoryAgentActor, RepositoryAgentTaskSource, RepositoryAgentWorkMode };
