import { Sandbox } from "@vercel/sandbox";

import { getInstallationOctokit } from "@/lib/agents/github/app";
import type { RepoTmsAgentGitHubContext } from "@/lib/agents/repo-tms-task";

const sandboxTimeoutMs = 10 * 60 * 1000;

type InstallationAuth = {
  token: string;
};

type ResolvedRepoTmsGitHubContext = Extract<RepoTmsAgentGitHubContext, { resolved: true }>;

export async function createRepoTmsSandbox(
  githubContext: ResolvedRepoTmsGitHubContext,
): Promise<string> {
  const octokit = await getInstallationOctokit(githubContext.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: `https://github.com/${githubContext.repositoryFullName}.git`,
      revision: githubContext.commitSha ?? githubContext.branch ?? "HEAD",
      depth: 1,
      username: "x-access-token",
      password: token,
    },
    timeout: sandboxTimeoutMs,
  });

  return sandbox.sandboxId;
}

export async function stopRepoTmsSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop();
}
