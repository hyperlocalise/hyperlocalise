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
import { GITLAB_API_ORIGIN } from "./constants";
import { loadGitLabPipesAccessToken } from "./pipes";
import type { GitLabAccess, GitLabApiError } from "./types";

const GITLAB_NOT_CONNECTED: GitLabApiError = {
  code: "gitlab_not_connected",
  message: "Connect GitLab in Integrations before using it.",
};

/**
 * The token and the server it belongs to, returned together so a token can't be sent elsewhere.
 * A workspace's own server replaces every member's GitLab.com account, so a project path can only
 * ever mean one server.
 */
export async function resolveGitLabAccess(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
}): Promise<Result<GitLabAccess, GitLabApiError>> {
  const connection = await loadGitLabConnectionCredentials({
    organizationId: input.localOrganizationId,
  });
  if (isErr(connection)) {
    return connection;
  }
  if (connection.value) {
    return ok(connection.value);
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
    ? `gitlab-connection:${connection.serverUrl}:${connection.updatedAt}`
    : (input.workosUserId ?? null);
}

/** Built here, not taken from a stored context: an old context may name a previous server. */
export function buildGitLabCloneUrl(baseUrl: string | null, repositoryFullName: string): string {
  return `${baseUrl ?? GITLAB_API_ORIGIN}/${repositoryFullName}.git`;
}

/** A stored chat context names a project on the server it came from, which may have been replaced. */
export async function isGitLabContextOnCurrentServer(input: {
  localOrganizationId: string;
  context: Pick<RepositoryAgentGitLabContext, "httpUrlToRepo" | "repositoryFullName">;
}): Promise<boolean> {
  const connection = await getGitLabConnection({ organizationId: input.localOrganizationId });
  const expected = buildGitLabCloneUrl(
    connection?.serverUrl ?? null,
    input.context.repositoryFullName,
  );
  return input.context.httpUrlToRepo.toLowerCase() === expected.toLowerCase();
}
