/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GitHubRawMessage } from "@chat-adapter/github";

export type GitHubMentionContext = {
  installationId: number;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  commentId: number | null;
};

function splitRepository(fullName: string) {
  const [repositoryOwner, repositoryName] = fullName.split("/");
  if (!repositoryOwner || !repositoryName) {
    return null;
  }

  return { repositoryOwner, repositoryName };
}

export function buildGitHubMentionContext(input: {
  raw: GitHubRawMessage;
  installationId: number;
}): GitHubMentionContext | null {
  const repo = splitRepository(input.raw.repository.full_name);
  if (!repo) {
    return null;
  }

  if (input.raw.type === "issue_comment" && input.raw.threadType === "issue") {
    return null;
  }

  return {
    installationId: input.installationId,
    repositoryOwner: repo.repositoryOwner,
    repositoryName: repo.repositoryName,
    repositoryFullName: input.raw.repository.full_name,
    pullRequestNumber: input.raw.prNumber,
    commentId: input.raw.comment.id,
  };
}
