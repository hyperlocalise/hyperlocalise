export type CrowdinOAuthScopeGuideEntry = {
  scope: string;
  description: string;
};

/** Scopes Hyperlocalise requests during Crowdin OAuth authorization. */
export const CROWDIN_OAUTH_SCOPE_GUIDE = [
  {
    scope: "language",
    description: "Organization languages used for locale metadata.",
  },
  {
    scope: "tm",
    description: "Translation memories for sync and live reads.",
  },
  {
    scope: "glossary",
    description: "Glossaries and terminology.",
  },
  {
    scope: "project",
    description: "Projects the connected user can access.",
  },
  {
    scope: "project.settings",
    description: "Project settings and configuration.",
  },
  {
    scope: "project.member",
    description: "Project members and teams.",
  },
  {
    scope: "project.task",
    description: "Project tasks and jobs.",
  },
  {
    scope: "project.report",
    description: "Project reports.",
  },
  {
    scope: "project.status",
    description: "Translation status and progress.",
  },
  {
    scope: "project.source",
    description: "Source files, strings, branches, and directories.",
  },
  {
    scope: "project.translation",
    description: "Translations and target-language content.",
  },
  {
    scope: "project.screenshot",
    description: "Screenshots and tags.",
  },
  {
    scope: "project.webhook",
    description: "Project webhook configuration.",
  },
] as const satisfies readonly CrowdinOAuthScopeGuideEntry[];

export const CROWDIN_OAUTH_SCOPES = CROWDIN_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope);

export function getCrowdinOAuthScopeString() {
  return CROWDIN_OAUTH_SCOPES.join(" ");
}
