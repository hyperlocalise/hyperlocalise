import { getInstallationOctokit } from "@/lib/agents/github/app";
import { buildGithubRepositoryAutomationJobDetailsUrl } from "@/lib/agents/github/github-repository-automation-check-run";
import {
  prepareGithubRepositoryAutomationSandboxForPush,
  runGitDiffInSandbox,
} from "@/lib/agents/github/github-repository-automation-sandbox";
import { runSandboxCommand, writeFilesToSandbox } from "@/lib/translation/sandbox";

import { buildPullTranslationsBranchName } from "./github-repository-automation-pull-translations-branch";
import type { PullTranslationExportCandidate } from "./github-repository-automation-pull-translations-export";

export { buildPullTranslationsBranchName };

function parseRepositoryOwnerRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error("invalid repository full name");
  }
  return { owner, repo };
}

export async function verifyExpectedBaseBranchHead(input: {
  installationId: string;
  repositoryFullName: string;
  baseBranch: string;
  expectedBaseSha: string;
}): Promise<{ ok: true } | { ok: false; actualBaseSha: string }> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { owner, repo } = parseRepositoryOwnerRepo(input.repositoryFullName);
  const ref = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${input.baseBranch}`,
  });

  const actualBaseSha = ref.data.object.sha;
  if (actualBaseSha !== input.expectedBaseSha) {
    return { ok: false, actualBaseSha };
  }

  return { ok: true };
}

export async function writePullTranslationCandidatesToSandbox(input: {
  sandboxId: string;
  candidates: PullTranslationExportCandidate[];
}): Promise<{ written: number; skipped: number }> {
  if (input.candidates.length === 0) {
    return { written: 0, skipped: 0 };
  }

  await writeFilesToSandbox(
    input.sandboxId,
    input.candidates.map((candidate) => ({
      path: candidate.targetPath,
      content: candidate.content,
    })),
  );

  return { written: input.candidates.length, skipped: 0 };
}

export async function commitPushAndCreatePullTranslationsPullRequest(input: {
  sandboxId: string;
  installationId: string;
  repositoryFullName: string;
  automationJobId: string;
  organizationSlug: string | null;
  githubRepositoryId: string;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  paths: string[];
  candidates: PullTranslationExportCandidate[];
  linkedTranslationJobIds: string[];
}): Promise<{ pullRequestUrl: string; pullRequestNumber: number; updated: boolean }> {
  const { owner, repo } = parseRepositoryOwnerRepo(input.repositoryFullName);
  const octokit = await getInstallationOctokit(input.installationId);

  await prepareGithubRepositoryAutomationSandboxForPush({
    sandboxId: input.sandboxId,
    installationId: input.installationId,
    repositoryFullName: input.repositoryFullName,
  });

  const existingPull = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${input.branchName}`,
    per_page: 1,
  });

  const isUpdatingExistingPull = existingPull.data.length > 0;
  const remoteBranchHeadSha = isUpdatingExistingPull ? existingPull.data[0]?.head.sha : undefined;

  const checkoutArgs = isUpdatingExistingPull
    ? ["checkout", "-f", input.branchName]
    : ["checkout", "-b", input.branchName];
  const checkout = await runSandboxCommand(input.sandboxId, "git", checkoutArgs);
  if (checkout.exitCode !== 0) {
    throw new Error(`git checkout failed: ${checkout.output}`);
  }

  if (isUpdatingExistingPull) {
    const reset = await runSandboxCommand(input.sandboxId, "git", [
      "reset",
      "--hard",
      input.baseSha,
    ]);
    if (reset.exitCode !== 0) {
      throw new Error(`git reset failed: ${reset.output}`);
    }
  }

  await writePullTranslationCandidatesToSandbox({
    sandboxId: input.sandboxId,
    candidates: input.candidates,
  });

  for (const path of input.paths) {
    const add = await runSandboxCommand(input.sandboxId, "git", ["add", "--", path]);
    if (add.exitCode !== 0) {
      throw new Error(`git add failed for ${path}: ${add.output}`);
    }
  }

  const commitMessage = `chore(i18n): update translations (${input.automationJobId.slice(0, 8)})`;
  const commit = await runSandboxCommand(input.sandboxId, "git", ["commit", "-m", commitMessage]);
  if (commit.exitCode !== 0) {
    throw new Error(`git commit failed: ${commit.output}`);
  }

  const pushArgs =
    isUpdatingExistingPull && remoteBranchHeadSha
      ? [
          "push",
          "-u",
          "origin",
          input.branchName,
          `--force-with-lease=refs/heads/${input.branchName}:${remoteBranchHeadSha}`,
        ]
      : ["push", "-u", "origin", input.branchName];
  const push = await runSandboxCommand(input.sandboxId, "git", pushArgs);
  if (push.exitCode !== 0) {
    throw new Error(`git push failed: ${push.output}`);
  }

  const jobDetailsUrl = buildGithubRepositoryAutomationJobDetailsUrl({
    organizationSlug: input.organizationSlug,
    githubRepositoryId: input.githubRepositoryId,
    jobId: input.automationJobId,
  });

  const bodyLines = [
    "## Hyperlocalise translation sync",
    "",
    "This pull request writes completed Hyperlocalise file translations back to the repository.",
    "",
    `- Automation job: \`${input.automationJobId}\``,
    `- Base commit: \`${input.baseSha}\``,
    `- Updated paths: ${input.paths.length}`,
    jobDetailsUrl ? `- [View automation run](${jobDetailsUrl})` : null,
    input.linkedTranslationJobIds.length > 0
      ? `- Linked translation jobs: ${input.linkedTranslationJobIds.map((id) => `\`${id}\``).join(", ")}`
      : null,
    "",
    "Please review locale file changes before merging.",
  ].filter((line): line is string => line !== null);

  if (isUpdatingExistingPull) {
    const pullRequest = existingPull.data[0];
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullRequest.number,
      body: bodyLines.join("\n"),
    });

    return {
      pullRequestUrl: pullRequest.html_url,
      pullRequestNumber: pullRequest.number,
      updated: true,
    };
  }

  const { data: pullRequest } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: commitMessage,
    head: input.branchName,
    base: input.baseBranch,
    body: bodyLines.join("\n"),
  });

  return {
    pullRequestUrl: pullRequest.html_url,
    pullRequestNumber: pullRequest.number,
    updated: false,
  };
}

export async function hasDiffAgainstBase(input: {
  sandboxId: string;
  baseSha: string;
  paths: string[];
  candidates: PullTranslationExportCandidate[];
}): Promise<boolean> {
  if (input.paths.length === 0) {
    return false;
  }

  await writePullTranslationCandidatesToSandbox({
    sandboxId: input.sandboxId,
    candidates: input.candidates,
  });

  for (const path of input.paths) {
    const add = await runSandboxCommand(input.sandboxId, "git", ["add", "--", path]);
    if (add.exitCode !== 0) {
      throw new Error(`git add failed for ${path}: ${add.output}`);
    }
  }

  const diff = await runGitDiffInSandbox(input.sandboxId, [
    "diff",
    "--cached",
    "--quiet",
    input.baseSha,
    "--",
    ...input.paths,
  ]);

  return diff.exitCode !== 0;
}
