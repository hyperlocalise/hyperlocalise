import {
  createVercelSandboxWorkspace,
  stopWorkspace,
} from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { getInstallationOctokit } from "@/lib/agents/github/app";
import type { RepositoryAgentGitHubContext } from "@/lib/agents/repository-agent-task";
import { createLogger, serializeErrorForLog } from "@/lib/log";

type ResolvedRepositoryGitHubContext = Extract<RepositoryAgentGitHubContext, { resolved: true }>;
type InstallationAuth = {
  token: string;
};

const logger = createLogger("repository-sandbox");

export async function createRepositorySandbox(
  githubContext: ResolvedRepositoryGitHubContext,
): Promise<string> {
  const log = logger.child({
    installationId: githubContext.installationId,
    repositoryFullName: githubContext.repositoryFullName,
    branch: githubContext.branch ?? null,
    commitSha: githubContext.commitSha ?? null,
  });
  log.info("minting github installation token for repository sandbox");
  const octokit = await getInstallationOctokit(githubContext.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const revision = githubContext.commitSha ?? githubContext.branch ?? "HEAD";
  log.info({ revision }, "creating vercel repository sandbox from git source");
  let workspace;
  try {
    workspace = await createVercelSandboxWorkspace({
      source: {
        type: "git",
        url: `https://github.com/${githubContext.repositoryFullName}.git`,
        revision,
        depth: 1,
        username: "x-access-token",
        password: token,
      },
    });
  } catch (error) {
    log.error(serializeErrorForLog(error), "vercel repository sandbox creation failed");
    throw error;
  }
  log.info({ sandboxId: workspace.id }, "vercel repository sandbox created");
  return workspace.id;
}

export async function stopRepositorySandbox(sandboxId: string): Promise<void> {
  await stopWorkspace(sandboxId);
}
