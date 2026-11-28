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

export type ChatRepositoryProvider = "github" | "gitlab" | "bitbucket";

export type ChatRepository = {
  archived: boolean;
  defaultBranch: string | null;
  enabled: boolean;
  fullName: string;
  name: string;
  provider: ChatRepositoryProvider;
  selectionKey: string;
};

export function chatRepositorySelectionKey(
  provider: ChatRepositoryProvider,
  fullName: string,
): string {
  return `${provider}:${fullName}`;
}

export function parseChatRepositorySelectionKey(
  key: string,
): { provider: ChatRepositoryProvider; fullName: string } | null {
  if (key.startsWith("github:")) {
    const fullName = key.slice("github:".length);
    return fullName ? { provider: "github", fullName } : null;
  }
  if (key.startsWith("gitlab:")) {
    const fullName = key.slice("gitlab:".length);
    return fullName ? { provider: "gitlab", fullName } : null;
  }
  if (key.startsWith("bitbucket:")) {
    const fullName = key.slice("bitbucket:".length);
    return fullName ? { provider: "bitbucket", fullName } : null;
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
}): ChatRepository {
  return {
    archived: project.archived,
    defaultBranch: project.defaultBranch,
    enabled: !project.archived,
    fullName: project.pathWithNamespace,
    name: project.name,
    provider: "gitlab",
    selectionKey: chatRepositorySelectionKey("gitlab", project.pathWithNamespace),
  };
}

/** A repository the workspace's Bitbucket connection can read; `fullName` is `workspace/repo-slug`. */
export function toChatRepositoryFromBitbucket(repository: {
  fullName: string;
  mainBranch: string | null;
}): ChatRepository {
  return {
    archived: false,
    defaultBranch: repository.mainBranch,
    enabled: true,
    fullName: repository.fullName,
    name: repository.fullName.split("/").pop() || repository.fullName,
    provider: "bitbucket",
    selectionKey: chatRepositorySelectionKey("bitbucket", repository.fullName),
  };
}
