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
