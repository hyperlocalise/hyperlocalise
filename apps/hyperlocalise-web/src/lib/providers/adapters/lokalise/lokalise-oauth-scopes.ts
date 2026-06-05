export const LOKALISE_OAUTH_SCOPE_GUIDE = [
  {
    scope: "read_projects",
    description: "Read Lokalise projects and project metadata.",
  },
  {
    scope: "read_keys",
    description: "Read source keys and translations.",
  },
  {
    scope: "write_keys",
    description: "Write reviewed translations back to keys.",
  },
  {
    scope: "read_files",
    description: "Download project files for source and target locale views.",
  },
  {
    scope: "read_tasks",
    description: "Read Lokalise tasks as provider jobs.",
  },
  {
    scope: "write_tasks",
    description: "Update provider task metadata where supported.",
  },
  {
    scope: "read_comments",
    description: "Read task and key comments for review context.",
  },
  {
    scope: "write_comments",
    description: "Post Hyperlocalise review comments back to Lokalise.",
  },
  {
    scope: "read_glossary",
    description: "Read glossary terms for terminology context.",
  },
  {
    scope: "read_translation_memory",
    description: "Read translation memory matches for translation context.",
  },
] as const;

export function getLokaliseOAuthScopeString() {
  return LOKALISE_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope).join(" ");
}
