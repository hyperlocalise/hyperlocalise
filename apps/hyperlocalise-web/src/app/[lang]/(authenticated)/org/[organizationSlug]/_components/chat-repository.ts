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
import type { GithubRepository } from "./github-repository";

export type ChatRepositoryProvider = "github" | "gitlab";

export type ChatRepository = {
  archived: boolean;
  defaultBranch: string | null;
  enabled: boolean;
  fullName: string;
  name: string;
  provider: ChatRepositoryProvider;
  selectionKey: string;
  gitlabConnectionId?: string | null;
};

const GITLAB_CONNECTION_KEY_PREFIX = "gitlab-connection:";

export function chatRepositorySelectionKey(
  provider: ChatRepositoryProvider,
  fullName: string,
  gitlabConnectionId?: string | null,
): string {
  if (provider === "gitlab" && gitlabConnectionId) {
    return `${GITLAB_CONNECTION_KEY_PREFIX}${gitlabConnectionId}:${fullName}`;
  }
  return `${provider}:${fullName}`;
}

export function parseChatRepositorySelectionKey(key: string): {
  provider: ChatRepositoryProvider;
  fullName: string;
  gitlabConnectionId?: string;
} | null {
  if (key.startsWith("github:")) {
    const fullName = key.slice("github:".length);
    return fullName ? { provider: "github", fullName } : null;
  }
  if (key.startsWith(GITLAB_CONNECTION_KEY_PREFIX)) {
    const rest = key.slice(GITLAB_CONNECTION_KEY_PREFIX.length);
    const separator = rest.indexOf(":");
    if (separator <= 0) {
      return null;
    }
    const gitlabConnectionId = rest.slice(0, separator);
    const fullName = rest.slice(separator + 1);
    return fullName ? { provider: "gitlab", fullName, gitlabConnectionId } : null;
  }
  if (key.startsWith("gitlab:")) {
    const fullName = key.slice("gitlab:".length);
    return fullName ? { provider: "gitlab", fullName } : null;
  }
  return null;
}

export function toChatRepositoryFromGithub(repository: GithubRepository): ChatRepository {
  return {
    archived: repository.archived,
    defaultBranch: repository.defaultBranch,
    enabled: repository.enabled,
    fullName: repository.fullName,
    name: repository.name,
    provider: "github",
    selectionKey: chatRepositorySelectionKey("github", repository.fullName),
  };
}

export function toChatRepositoryFromGitlab(project: {
  archived: boolean;
  defaultBranch: string | null;
  name: string;
  pathWithNamespace: string;
  connectionId?: string | null;
}): ChatRepository {
  return {
    archived: project.archived,
    defaultBranch: project.defaultBranch,
    enabled: !project.archived,
    fullName: project.pathWithNamespace,
    name: project.name,
    provider: "gitlab",
    gitlabConnectionId: project.connectionId ?? null,
    selectionKey: chatRepositorySelectionKey(
      "gitlab",
      project.pathWithNamespace,
      project.connectionId,
    ),
  };
}
