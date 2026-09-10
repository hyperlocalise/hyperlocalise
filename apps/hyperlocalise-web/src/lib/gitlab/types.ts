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

export type GitLabMergeRequestDetails = {
  iid: number;
  sourceBranch: string | null;
  commitSha: string | null;
};
