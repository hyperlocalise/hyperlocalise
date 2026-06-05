export type LokaliseOAuthScopeGuideEntry = {
  scope: string;
  description: string;
};

/** Scopes Hyperlocalise requests during Lokalise OAuth authorization. */
export const LOKALISE_OAUTH_SCOPE_GUIDE = [
  {
    scope: "read_projects",
    description: "Projects the connected user can access.",
  },
  {
    scope: "read_keys",
    description: "Keys, filenames, comments, and project string metadata.",
  },
  {
    scope: "write_keys",
    description: "Key updates needed for approved write-back flows.",
  },
  {
    scope: "read_translations",
    description: "Target-language translations for content pull and review.",
  },
  {
    scope: "write_translations",
    description: "Approved translation write-back.",
  },
  {
    scope: "read_tasks",
    description: "Lokalise tasks shown as provider jobs.",
  },
  {
    scope: "read_comments",
    description: "Review comments attached to keys.",
  },
  {
    scope: "write_comments",
    description: "Agent review comments and QA feedback write-back.",
  },
  {
    scope: "read_contributors",
    description: "Identifies the connected Lokalise contributor for account linking.",
  },
  {
    scope: "read_glossary",
    description: "Glossary terms for terminology matching.",
  },
  {
    scope: "write_glossary",
    description: "Glossary term updates when supported by provider flows.",
  },
  {
    scope: "read_translation_memory",
    description: "Translation memory segments for TM matching.",
  },
] as const satisfies readonly LokaliseOAuthScopeGuideEntry[];

export const LOKALISE_OAUTH_SCOPES = LOKALISE_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope);

export function getLokaliseOAuthScopeString() {
  return LOKALISE_OAUTH_SCOPES.join(" ");
}
