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
import { describe, expect, it } from "vite-plus/test";

import {
  PHRASE_OAUTH_SCOPE_GUIDE,
  PHRASE_OAUTH_SCOPES,
  getPhraseOAuthScopeString,
} from "./phrase-provider";

describe("phrase-oauth-scopes", () => {
  it("builds a space-separated authorize scope string", () => {
    expect(getPhraseOAuthScopeString()).toBe(PHRASE_OAUTH_SCOPES.join(" "));
    expect(getPhraseOAuthScopeString()).toContain("openid");
    expect(getPhraseOAuthScopeString()).toContain("offline_access");
  });

  it("keeps guide entries aligned with requested scopes", () => {
    expect(PHRASE_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope)).toEqual(PHRASE_OAUTH_SCOPES);
  });
});
