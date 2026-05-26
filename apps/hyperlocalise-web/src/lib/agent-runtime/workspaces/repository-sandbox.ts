import {
  createVercelSandboxWorkspace,
  stopWorkspace,
} from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { getInstallationOctokit } from "@/lib/agents/github/app";
import type { RepositoryAgentGitHubContext } from "@/lib/agents/repository-agent-task";

type ResolvedRepositoryGitHubContext = Extract<RepositoryAgentGitHubContext, { resolved: true }>;
type InstallationAuth = {
  token: string;
};

export async function createRepositorySandbox(
  githubContext: ResolvedRepositoryGitHubContext,
): Promise<string> {
  const octokit = await getInstallationOctokit(githubContext.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const workspace = await createVercelSandboxWorkspace({
    source: {
      type: "git",
      url: `https://github.com/${githubContext.repositoryFullName}.git`,
      revision: githubContext.commitSha ?? githubContext.branch ?? "HEAD",
      depth: 1,
      username: "x-access-token",
      password: token,
    },
  });
  return workspace.id;
}

export async function stopRepositorySandbox(sandboxId: string): Promise<void> {
  await stopWorkspace(sandboxId);
}
