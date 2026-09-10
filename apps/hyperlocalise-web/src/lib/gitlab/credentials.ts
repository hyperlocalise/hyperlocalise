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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { GITLAB_API_ORIGIN } from "./constants";
import { loadGitLabConnectionWithAccessToken } from "./connections";
import { loadGitLabPipesAccessToken } from "./pipes";
import type { GitLabConnectionError, GitLabConnectionWithAccessToken } from "./types";

export type GitLabCloneCredentials = {
  accessToken: string;
  apiOrigin: string;
  connectionId: string | null;
};

export async function loadGitLabCloneCredentials(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  connectionId?: string | null;
}): Promise<Result<GitLabCloneCredentials, GitLabConnectionError>> {
  if (input.connectionId) {
    const connectionResult = await loadGitLabConnectionWithAccessToken({
      organizationId: input.localOrganizationId,
      connectionId: input.connectionId,
    });
    if (isErr(connectionResult)) {
      return connectionResult;
    }

    return ok({
      accessToken: connectionResult.value.accessToken,
      apiOrigin: connectionResult.value.connection.baseUrl,
      connectionId: connectionResult.value.connection.id,
    });
  }

  if (!input.workosUserId) {
    return err({
      code: "gitlab_not_connected",
      message: "Connect GitLab in Integrations before using it.",
    });
  }

  const pipesResult = await loadGitLabPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(pipesResult)) {
    return pipesResult;
  }

  return ok({
    accessToken: pipesResult.value,
    apiOrigin: GITLAB_API_ORIGIN,
    connectionId: null,
  });
}

export async function loadGitLabConnectionCredential(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<GitLabConnectionWithAccessToken, GitLabConnectionError>> {
  return loadGitLabConnectionWithAccessToken(input);
}
