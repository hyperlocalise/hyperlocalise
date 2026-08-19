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
import { createLogger } from "@/lib/log";

const logger = createLogger("github-pull-request-merge-base");

export function parseGithubRepositoryFullName(
  value: string | undefined,
): { owner: string; repo: string } | null {
  const [owner, repo] = value?.split("/") ?? [];
  if (!owner?.trim() || !repo?.trim()) {
    return null;
  }

  return { owner: owner.trim(), repo: repo.trim() };
}

export async function resolveGithubPullRequestMergeBaseSha(input: {
  githubInstallationId: string;
  repositoryFullName: string;
  base: string;
  head: string;
}): Promise<string | null> {
  const repository = parseGithubRepositoryFullName(input.repositoryFullName);
  const base = input.base.trim();
  const head = input.head.trim();
  if (!repository || !base || !head) {
    return null;
  }

  try {
    const octokit = await getInstallationOctokit(input.githubInstallationId);
    const { data } = await octokit.rest.repos.compareCommits({
      owner: repository.owner,
      repo: repository.repo,
      base,
      head,
    });
    const mergeBaseSha = data.merge_base_commit?.sha?.trim() ?? "";
    return mergeBaseSha.length > 0 ? mergeBaseSha : null;
  } catch (error) {
    logger.warn(
      {
        githubInstallationId: input.githubInstallationId,
        error: error instanceof Error ? error.message : String(error),
      },
      "failed to resolve pull request merge base",
    );
    return null;
  }
}
