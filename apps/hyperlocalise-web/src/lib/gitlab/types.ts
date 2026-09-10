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

export type GitLabConnectionError =
  | GitLabPipesError
  | { code: "gitlab_access_token_required"; message: string }
  | { code: "gitlab_base_url_invalid"; message: string }
  | { code: "gitlab_com_uses_pipes"; message: string }
  | { code: "gitlab_connection_not_found"; message: string }
  | { code: "gitlab_connection_decrypt_failed"; message: string }
  | { code: "gitlab_connection_validation_failed"; message: string }
  | { code: "gitlab_connection_in_use"; message: string }
  | { code: "gitlab_connection_duplicate"; message: string };

export type GitLabApiError =
  | GitLabPipesError
  | GitLabConnectionError
  | { code: "gitlab_unauthorized"; message: string }
  | { code: "gitlab_not_found"; message: string }
  | { code: "gitlab_request_failed"; message: string; status: number };

export type GitLabProject = {
  id: number;
  name: string;
  pathWithNamespace: string;
  defaultBranch: string | null;
  httpUrlToRepo: string;
  archived: boolean;
};

export type ListedGitLabProject = GitLabProject & {
  instanceOrigin: string;
  connectionId: string | null;
};

export type GitLabConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedAccessTokenSuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type GitLabConnectionWithAccessToken = {
  connection: GitLabConnectionSummary;
  accessToken: string;
};

export type GitLabMergeRequestDetails = {
  iid: number;
  sourceBranch: string | null;
  commitSha: string | null;
};
