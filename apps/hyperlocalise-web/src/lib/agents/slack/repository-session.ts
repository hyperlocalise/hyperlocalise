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
import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";

export type { RepositoryAgentGitHubContext };

export function getSlackRepositoryContextKey(context: RepositoryAgentGitHubContext): string {
  return JSON.stringify({
    installationId: context.installationId,
    repositoryFullName: context.repositoryFullName,
    pullRequestNumber: context.pullRequestNumber ?? null,
    branch: context.branch ?? null,
    commitSha: context.commitSha ?? null,
    commentId: context.commentId ?? null,
  });
}

export type SlackRepositorySandboxSession = {
  sandboxId: string;
  repositoryContextKey: string;
  createdAt: string;
  lastUsedAt: string;
};

export type SlackImageLocalizationOutput = {
  fileId: string;
  filename: string;
  contentType: string;
  targetLocale: string;
  instructions: string | null;
  createdAt: string;
};

export type SlackImageSourceAsset = {
  sourceFileId: string;
  filename: string;
  contentType: string;
  localizedOutputs: SlackImageLocalizationOutput[];
};

export type PendingSlackImageTask = {
  sourceAssets: Array<{
    sourceFileId: string;
    filename: string;
    contentType: string;
  }>;
};

export type SlackBotThreadState = {
  warnedNonMemberUsers?: string[];
  repositoryGitHubContext?: RepositoryAgentGitHubContext;
  repositorySandboxSession?: SlackRepositorySandboxSession;
  pendingSlackImageTask?: PendingSlackImageTask;
  imageSourceAssets?: SlackImageSourceAsset[];
};
