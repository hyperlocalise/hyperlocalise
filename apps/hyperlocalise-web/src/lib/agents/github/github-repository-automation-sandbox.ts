import {
  createVercelSandboxWorkspace,
  stopWorkspace,
} from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { getInstallationOctokit } from "@/lib/agents/github/app";
import { prepareSandbox, runSandboxCommand } from "@/lib/translation/sandbox-translation";

const sandboxTimeoutMs = 10 * 60 * 1000;

type InstallationAuth = {
  token: string;
};

export async function createGithubRepositoryAutomationSandbox(input: {
  installationId: string;
  repositoryFullName: string;
  revision: string;
  cloneDepth?: number;
}): Promise<string> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;

  const workspace = await createVercelSandboxWorkspace({
    source: {
      type: "git",
      url: `https://github.com/${input.repositoryFullName}.git`,
      revision: input.revision,
      depth: input.cloneDepth ?? 50,
      username: "x-access-token",
      password: token,
    },
    timeoutMs: sandboxTimeoutMs,
  });

  return workspace.id;
}

export async function stopGithubRepositoryAutomationSandbox(sandboxId: string): Promise<void> {
  await stopWorkspace(sandboxId);
}

export async function checkoutCommitInSandbox(sandboxId: string, commitSha: string): Promise<void> {
  const result = await runSandboxCommand(sandboxId, "git", ["checkout", "--force", commitSha]);
  if (result.exitCode !== 0) {
    throw new Error(`git checkout failed for commit ${commitSha}`);
  }
}

export async function runGitLogInSandbox(
  sandboxId: string,
  args: string[],
): Promise<{ exitCode: number; output: string }> {
  await prepareSandbox(sandboxId);
  return runSandboxCommand(sandboxId, "git", args, { output: "stdout" });
}

export async function runGitDiffInSandbox(
  sandboxId: string,
  args: string[],
): Promise<{ exitCode: number; output: string }> {
  return runSandboxCommand(sandboxId, "git", args, { output: "stdout" });
}

export async function prepareGithubRepositoryAutomationSandboxForPush(input: {
  sandboxId: string;
  installationId: string;
  repositoryFullName: string;
}): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const remote = `https://github.com/${input.repositoryFullName}.git`;

  for (const [command, args, options] of [
    ["git", ["config", "user.name", "hyperlocalise[bot]"]],
    ["git", ["config", "user.email", "hyperlocalise[bot]@users.noreply.github.com"]],
    ["git", ["config", "credential.helper", "store"]],
    [
      "bash",
      [
        "-lc",
        `printf '%s\\n' "https://x-access-token:$GITHUB_TOKEN@github.com" > ~/.git-credentials`,
      ],
      { env: { GITHUB_TOKEN: token } },
    ],
    ["git", ["remote", "set-url", "origin", remote]],
  ] satisfies Array<[string, string[], { env?: Record<string, string> }?]>) {
    const result = await runSandboxCommand(input.sandboxId, command, args, options);
    if (result.exitCode !== 0) {
      throw new Error(`sandbox git setup failed: ${result.output}`);
    }
  }
}

export async function resolveDefaultBranchHeadSha(input: {
  installationId: string;
  owner: string;
  repo: string;
  branch?: string | null;
}): Promise<{ branch: string; sha: string }> {
  const octokit = await getInstallationOctokit(input.installationId);
  const repo = await octokit.rest.repos.get({ owner: input.owner, repo: input.repo });
  const branch = input.branch ?? repo.data.default_branch;
  const ref = await octokit.rest.git.getRef({
    owner: input.owner,
    repo: input.repo,
    ref: `heads/${branch}`,
  });

  return { branch, sha: ref.data.object.sha };
}
