/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type PhraseOAuthScopeGuideEntry = {
  scope: string;
  description: string;
};

/** Scopes Hyperlocalise requests during Phrase TMS OAuth authorization. */
export const PHRASE_OAUTH_SCOPE_GUIDE = [
  {
    scope: "openid",
    description: "OpenID Connect authorization for Phrase TMS bearer-token API access.",
  },
  {
    scope: "offline_access",
    description: "Requests refresh-token access so Phrase TMS user connections can be renewed.",
  },
] as const satisfies readonly PhraseOAuthScopeGuideEntry[];

export const PHRASE_OAUTH_SCOPES = PHRASE_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope);

export function getPhraseOAuthScopeString() {
  return PHRASE_OAUTH_SCOPES.join(" ");
}
