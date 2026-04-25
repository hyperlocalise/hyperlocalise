import type { GitHubRawMessage } from "@chat-adapter/github";

import type { GitHubFixRequestedEventData } from "@/lib/workflow/types";

import type { HyperlocaliseFixCommand } from "./commands";

function splitRepository(fullName: string) {
  const [repositoryOwner, repositoryName] = fullName.split("/");
  if (!repositoryOwner || !repositoryName) {
    return null;
  }

  return { repositoryOwner, repositoryName };
}

export function buildFixEvent(input: {
  raw: GitHubRawMessage;
  command: HyperlocaliseFixCommand;
  installationId: number;
}): GitHubFixRequestedEventData | null {
  const repo = splitRepository(input.raw.repository.full_name);
  if (!repo) {
    return null;
  }

  const base = {
    installationId: input.installationId,
    repositoryOwner: repo.repositoryOwner,
    repositoryName: repo.repositoryName,
    repositoryFullName: input.raw.repository.full_name,
    pullRequestNumber: input.raw.prNumber,
  };

  if (input.raw.type === "issue_comment") {
    if (input.raw.threadType === "issue") {
      return null;
    }

    return {
      ...base,
      trigger: {
        event: "issue_comment",
        action: "created",
        deliveryId: String(input.raw.comment.id),
        commentId: input.raw.comment.id,
      },
      scope: { type: "pull_request" },
    };
  }

  return {
    ...base,
    trigger: {
      event: "pull_request_review_comment",
      action: "created",
      deliveryId: String(input.raw.comment.id),
      commentId: input.raw.comment.id,
    },
    scope: {
      type: "review_comment",
      path: input.raw.comment.path,
      line: input.raw.comment.line ?? null,
      originalLine: input.raw.comment.original_line ?? null,
      side: input.raw.comment.side ?? null,
      commitSha: input.raw.comment.commit_id ?? input.raw.comment.original_commit_id ?? null,
      locale: input.command.locale,
    },
  };
}
