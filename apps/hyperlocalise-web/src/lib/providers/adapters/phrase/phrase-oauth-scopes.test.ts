import { describe, expect, it } from "vite-plus/test";

import {
  PHRASE_OAUTH_SCOPE_GUIDE,
  PHRASE_OAUTH_SCOPES,
  getPhraseOAuthScopeString,
} from "./phrase-oauth-scopes";

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
