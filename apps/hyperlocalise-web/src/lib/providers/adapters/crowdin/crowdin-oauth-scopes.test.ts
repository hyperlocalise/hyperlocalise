import { describe, expect, it } from "vite-plus/test";

import {
  CROWDIN_OAUTH_SCOPE_GUIDE,
  CROWDIN_OAUTH_SCOPES,
  getCrowdinOAuthScopeString,
} from "./crowdin-oauth-scopes";

describe("crowdin-oauth-scopes", () => {
  it("includes all Crowdin project.* scopes", () => {
    const projectScopes = CROWDIN_OAUTH_SCOPES.filter(
      (scope) => scope === "project" || scope.startsWith("project."),
    );

    expect(projectScopes).toEqual([
      "project",
      "project.settings",
      "project.member",
      "project.task",
      "project.report",
      "project.status",
      "project.source",
      "project.translation",
      "project.screenshot",
      "project.webhook",
    ]);
  });

  it("includes supporting organization scopes", () => {
    expect(CROWDIN_OAUTH_SCOPES).toEqual(expect.arrayContaining(["language", "tm", "glossary"]));
  });

  it("builds a space-separated authorize scope string", () => {
    expect(getCrowdinOAuthScopeString()).toBe(CROWDIN_OAUTH_SCOPES.join(" "));
    expect(getCrowdinOAuthScopeString()).toContain("project.task");
    expect(getCrowdinOAuthScopeString()).not.toContain(" task ");
  });

  it("keeps guide entries aligned with requested scopes", () => {
    expect(CROWDIN_OAUTH_SCOPE_GUIDE.map((entry) => entry.scope)).toEqual(CROWDIN_OAUTH_SCOPES);
  });
});
