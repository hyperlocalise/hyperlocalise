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

/** The branch's head on GitHub, or undefined when the branch does not exist. */
async function readRemoteBranchHeadSha(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  input: { owner: string; repo: string; branch: string },
): Promise<string | undefined> {
  try {
    const ref = await octokit.rest.git.getRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${input.branch}`,
    });
    return ref.data.object.sha;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Whether the open pull request already makes exactly this change: its one commit touches the same
 * files with the same content as this run's commit, on a base whose copy of those files has not
 * moved since. Any git failure answers false, so the run pushes.
 */
async function branchHasSameChange(input: {
  sandboxId: string;
  branchName: string;
}): Promise<boolean> {
  const git = (args: string[]) =>
    runSandboxCommand(input.sandboxId, "git", ["-c", "core.quotePath=false", ...args], {
      output: "stdout",
    });
  const changedFiles = async (from: string, to: string) => {
    const result = await git(["diff", "--name-only", "-z", from, to]);
    return result.exitCode === 0
      ? result.output
          .split("\0")
          .filter((path) => path.length > 0)
          .sort()
      : null;
  };

  const fetch = await git(["fetch", "--depth", "2", "origin", `refs/heads/${input.branchName}`]);
  if (fetch.exitCode !== 0) {
    return false;
  }
  // This run's commit sits on HEAD~1, the base; git leaves out files that already match it.
  const ours = await changedFiles("HEAD~1", "HEAD");
  const theirs = await changedFiles("FETCH_HEAD~1", "FETCH_HEAD");
  if (!ours || !theirs || ours.length === 0 || ours.join("\0") !== theirs.join("\0")) {
    return false;
  }
  const baseUnchanged = await git(["diff", "--quiet", "FETCH_HEAD~1", "HEAD~1", "--", ...ours]);
  if (baseUnchanged.exitCode !== 0) {
    return false;
  }
  const sameContent = await git(["diff", "--quiet", "FETCH_HEAD", "HEAD", "--", ...ours]);
  return sameContent.exitCode === 0;
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
  /**
   * The branch is reused across runs: start it from the base, overwrite a branch left by a merged or
   * closed pull request, and leave an open pull request alone when its files would not change.
   */
  reuseBranch?: boolean;
}): Promise<{
  pullRequestUrl: string;
  pullRequestNumber: number;
  updated: boolean;
  /** False when an open pull request already had these files and nothing was pushed. */
  pushed: boolean;
}> {
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
  // A reused branch can outlive its pull request (merged or closed without deleting the branch).
  const remoteBranchHeadSha = isUpdatingExistingPull
    ? existingPull.data[0]?.head.sha
    : input.reuseBranch
      ? await readRemoteBranchHeadSha(octokit, { owner, repo, branch: input.branchName })
      : undefined;

  // The sandbox is a shallow clone of the base, so a reused branch is rebuilt from it.
  const checkoutArgs = input.reuseBranch
    ? ["checkout", "-B", input.branchName, input.baseSha]
    : isUpdatingExistingPull
      ? ["checkout", "-f", input.branchName]
      : ["checkout", "-b", input.branchName];
  const checkout = await runSandboxCommand(input.sandboxId, "git", checkoutArgs);
  if (checkout.exitCode !== 0) {
    throw new Error(`git checkout failed: ${checkout.output}`);
  }

  if (isUpdatingExistingPull && !input.reuseBranch) {
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

  const openPull = existingPull.data[0];
  // Unrelated commits on the base do not count; the pull request still merges cleanly.
  if (
    input.reuseBranch &&
    openPull &&
    (await branchHasSameChange({ sandboxId: input.sandboxId, branchName: input.branchName }))
  ) {
    return {
      pullRequestUrl: openPull.html_url,
      pullRequestNumber: openPull.number,
      updated: false,
      pushed: false,
    };
  }

  const pushArgs = remoteBranchHeadSha
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
      pushed: true,
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
    pushed: true,
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
