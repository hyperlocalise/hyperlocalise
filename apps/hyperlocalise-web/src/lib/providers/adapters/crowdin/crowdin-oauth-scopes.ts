/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
