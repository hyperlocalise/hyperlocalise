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

import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/gitlab-repository-task";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { getGitLabConnection, loadGitLabConnectionCredentials } from "./connections";
import { buildGitLabCloneUrl } from "./client";
import { loadGitLabPipesAccessToken } from "./pipes";
import type { GitLabAccess, GitLabApiError } from "./types";

const GITLAB_NOT_CONNECTED: GitLabApiError = {
  code: "gitlab_not_connected",
  message: "Connect GitLab in Integrations before using it.",
};

const GITLAB_CONNECTION_REMOVED: GitLabApiError = {
  code: "gitlab_connection_removed",
  message: "The GitLab connection this uses was removed in Integrations. Choose another.",
};

/**
 * The token and the server it belongs to, returned together so a token can't be sent elsewhere.
 * A workspace's own connections replace every member's GitLab.com account, so a project path
 * means the workspace's default connection, or the one named by `connectionId`.
 */
export async function resolveGitLabAccess(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  /** A connection chosen for this use, such as a project sync's; the default otherwise. */
  connectionId?: string | null;
}): Promise<Result<GitLabAccess, GitLabApiError>> {
  const connection = await loadGitLabConnectionCredentials({
    organizationId: input.localOrganizationId,
    connectionId: input.connectionId,
  });
  if (isErr(connection)) {
    return connection;
  }
  if (connection.value) {
    return ok({ accessToken: connection.value.accessToken, baseUrl: connection.value.baseUrl });
  }
  if (input.connectionId) {
    return err(GITLAB_CONNECTION_REMOVED);
  }

  if (!input.workosUserId) {
    return err(GITLAB_NOT_CONNECTED);
  }

  const token = await loadGitLabPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  return isErr(token) ? token : ok({ accessToken: token.value, baseUrl: null });
}

/**
 * Whose credentials a clone was made with: a sandbox can be reused only for the same owner, so
 * saving the connection again, or changing user on GitLab.com, starts a fresh one.
 */
export async function resolveGitLabCredentialOwner(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
}): Promise<string | null> {
  const connection = await getGitLabConnection({ organizationId: input.localOrganizationId });
  return connection
    ? `gitlab-connection:${connection.id}:${connection.serverUrl}:${connection.updatedAt}`
    : (input.workosUserId ?? null);
}

export type StoredGitLabContextCheck<T> = {
  context: T | null;
  /** Why a stored context was set aside, so the chat can say so rather than go quiet. */
  dropped: "server_changed" | "token_unreadable" | null;
};

/**
 * A stored chat context names a project on the server it came from, which may since have been
 * replaced or removed, or whose saved token can no longer be read. Returns the context only
 * while it can still be used with the current connection.
 */
export async function checkStoredGitLabContext<
  T extends Pick<RepositoryAgentGitLabContext, "httpUrlToRepo" | "repositoryFullName">,
>(input: {
  localOrganizationId: string;
  context: T | null | undefined;
}): Promise<StoredGitLabContextCheck<T>> {
  if (!input.context) {
    return { context: null, dropped: null };
  }
  const connection = await loadGitLabConnectionCredentials({
    organizationId: input.localOrganizationId,
  });
  if (isErr(connection)) {
    return { context: null, dropped: "token_unreadable" };
  }
  const expected = buildGitLabCloneUrl(
    connection.value?.baseUrl ?? null,
    input.context.repositoryFullName,
  );
  return input.context.httpUrlToRepo.toLowerCase() === expected.toLowerCase()
    ? { context: input.context, dropped: null }
    : { context: null, dropped: "server_changed" };
}

export async function keepGitLabContextIfCurrent<
  T extends Pick<RepositoryAgentGitLabContext, "httpUrlToRepo" | "repositoryFullName">,
>(input: { localOrganizationId: string; context: T | null | undefined }): Promise<T | null> {
  return (await checkStoredGitLabContext(input)).context;
}
