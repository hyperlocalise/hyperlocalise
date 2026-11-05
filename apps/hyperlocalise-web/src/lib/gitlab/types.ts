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

export type GitLabPipesError =
  | { code: "gitlab_pipes_unavailable"; message: string }
  | { code: "gitlab_not_connected"; message: string }
  | { code: "gitlab_pipes_needs_reauthorization"; message: string };

export type GitLabApiError =
  | GitLabPipesError
  | { code: "gitlab_connection_decrypt_failed"; message: string }
  | { code: "gitlab_connection_removed"; message: string }
  | { code: "gitlab_unauthorized"; message: string }
  | { code: "gitlab_not_found"; message: string }
  | { code: "gitlab_request_failed"; message: string; status: number; timedOut?: boolean };

export type GitLabProject = {
  id: number;
  name: string;
  pathWithNamespace: string;
  defaultBranch: string | null;
  httpUrlToRepo: string;
  archived: boolean;
  /**
   * The token's highest role on the project (GitLab's numbers: 10 Guest, 20 Reporter, 30
   * Developer, 40 Maintainer, 50 Owner), or null when the answer didn't say.
   */
  accessLevel: number | null;
};

/** What a token may do, as GitLab describes it; null when GitLab can't describe the token. */
export type GitLabTokenAbilities = {
  scopes: string[];
  /** The api scope: can push branches and open merge requests. */
  canSend: boolean;
  expiresAt: string | null;
};

/** What a live check of a saved connection found. */
export type GitLabConnectionCheck = {
  abilities: GitLabTokenAbilities | null;
  /** Whether the token can read at least one project (the Reporter role or above). */
  readsProjects: boolean;
};

export type GitLabMergeRequestDetails = {
  iid: number;
  sourceBranch: string | null;
  commitSha: string | null;
};

/** Who to ask and with what. A null baseUrl means GitLab.com; it's required so no caller defaults to it by accident. */
export type GitLabAccess = {
  accessToken: string;
  baseUrl: string | null;
};

export type GitLabConnectionSummary = {
  id: string;
  /** What people call it: the saved name, or the server's host for one saved before names. */
  name: string;
  /** The saved name alone, so a form can start from it; null shows as the host. */
  storedName: string | null;
  isDefault: boolean;
  serverUrl: string;
  connectedUsername: string;
  maskedTokenSuffix: string;
  updatedAt: string;
  /** Project syncs that name this connection; they stop until repointed if it is removed. */
  syncCount: number;
};

export type GitLabConnectionDecryptError = {
  code: "gitlab_connection_decrypt_failed";
  message: string;
};

export type GitLabConnectionError =
  | { code: "gitlab_server_url_invalid"; message: string }
  | { code: "gitlab_server_unreachable"; message: string }
  | { code: "gitlab_server_not_recognized"; message: string }
  | { code: "gitlab_token_rejected"; message: string }
  | { code: "gitlab_token_invalid"; message: string }
  | { code: "gitlab_connection_not_found"; message: string }
  | { code: "gitlab_connection_decrypt_failed"; message: string };
