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
export type BitbucketApiError =
  | { code: "bitbucket_connection_decrypt_failed"; message: string }
  | { code: "bitbucket_connection_removed"; message: string }
  | { code: "bitbucket_not_connected"; message: string }
  | { code: "bitbucket_unauthorized"; message: string }
  | { code: "bitbucket_forbidden"; message: string }
  | { code: "bitbucket_not_found"; message: string }
  | { code: "bitbucket_request_failed"; message: string; status: number; timedOut?: boolean };

/**
 * Who to ask Bitbucket Cloud as. An Atlassian API token is sent with its account's email (basic
 * auth); a workspace, project or repository access token is sent alone (bearer).
 */
export type BitbucketAccess = {
  accessToken: string;
  accountEmail: string | null;
};

export type BitbucketRepository = {
  /** Bitbucket's own id, with its braces: `{…}`. Kept with a sync so a renamed path can't point elsewhere. */
  uuid: string;
  /** `workspace/repo-slug`. */
  fullName: string;
  name: string;
  mainBranch: string | null;
};

/** What a live check of a saved connection found. */
export type BitbucketConnectionCheck = {
  /** Whether the token can read at least one repository. */
  readsRepositories: boolean;
};

export type BitbucketConnectionSummary = {
  id: string;
  /** What people call it: the saved name, else the connected account. */
  name: string;
  /** The saved name alone, so a form can start from it. */
  storedName: string | null;
  isDefault: boolean;
  /** The Atlassian account email an API token is sent with; null for an access token. */
  accountEmail: string | null;
  connectedAccount: string | null;
  maskedTokenSuffix: string;
  updatedAt: string;
  /** Project syncs that name this connection; they stop until repointed if it is removed. */
  syncCount: number;
};

export type BitbucketConnectionDecryptError = {
  code: "bitbucket_connection_decrypt_failed";
  message: string;
};

export type BitbucketConnectionError =
  | { code: "bitbucket_unreachable"; message: string }
  | { code: "bitbucket_token_rejected"; message: string }
  | { code: "bitbucket_token_invalid"; message: string }
  | { code: "bitbucket_email_invalid"; message: string }
  | { code: "bitbucket_connection_not_found"; message: string }
  | { code: "bitbucket_connection_decrypt_failed"; message: string };
