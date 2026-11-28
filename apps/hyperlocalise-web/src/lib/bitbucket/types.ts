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
  | { code: "bitbucket_not_connected"; message: string }
  | { code: "bitbucket_needs_reconnect"; message: string }
  | { code: "bitbucket_unavailable"; message: string }
  | { code: "bitbucket_unauthorized"; message: string }
  | { code: "bitbucket_forbidden"; message: string }
  | { code: "bitbucket_not_found"; message: string }
  | { code: "bitbucket_request_failed"; message: string; status: number; timedOut?: boolean };

/** The workspace's Bitbucket token, issued by WorkOS Pipes for its shared connection. */
export type BitbucketAccess = {
  accessToken: string;
};

export type BitbucketRepository = {
  /** Bitbucket's own id, with its braces: `{…}`. Kept with a sync so a renamed path can't point elsewhere. */
  uuid: string;
  /** `workspace/repo-slug`. */
  fullName: string;
  name: string;
  mainBranch: string | null;
};

/** The workspace's shared Bitbucket connection, as Integrations shows it. */
export type BitbucketConnectionStatus = {
  connected: boolean;
  /** Bitbucket must be connected again: the sign-in lapsed, or the admin who connected it left. */
  needsReconnect: boolean;
  /** The admin who connected it has left the workspace. */
  connectorLeft: boolean;
  /** The Bitbucket account's name, when given. */
  accountName: string | null;
};
