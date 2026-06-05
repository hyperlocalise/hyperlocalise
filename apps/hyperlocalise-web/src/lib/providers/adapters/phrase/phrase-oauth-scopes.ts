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
] as const satisfies readonly PhraseOAuthScopeGuideEntry[];

export const PHRASE_OAUTH_SCOPES = PHRASE_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope);

export function getPhraseOAuthScopeString() {
  return PHRASE_OAUTH_SCOPES.join(" ");
}
