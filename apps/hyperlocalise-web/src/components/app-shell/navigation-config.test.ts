import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_KNOWLEDGE_FLAG,
} from "@/lib/flags/workos-flag-entities";

import {
  buildGlobalNavigationGroups,
  buildOrganizationPath,
  buildProjectNavigationItems,
  buildProjectPath,
  isNavigationItemActive,
  parseProjectRoute,
  stripAppLocalePrefix,
} from "./navigation-config";

describe("navigation-config", () => {
  it("encodes external project ids as one path segment and parses them back", () => {
    const projectId = "ext:crowdin:902807";
    const path = buildProjectPath("hyperlocalise", projectId, "files");

    expect(path).toBe("/org/hyperlocalise/projects/ext%3Acrowdin%3A902807/files");
    expect(parseProjectRoute(path)).toEqual({
      organizationSlug: "hyperlocalise",
      projectId,
      section: "files",
    });
  });

  it("parses project routes with a locale prefix", () => {
    const projectId = "proj_1";

    expect(parseProjectRoute("/en/org/acme/projects/proj_1")).toEqual({
      organizationSlug: "acme",
      projectId,
      section: null,
    });
    expect(parseProjectRoute("/en/org/acme/projects/proj_1/files")).toEqual({
      organizationSlug: "acme",
      projectId,
      section: "files",
    });
  });

  it("marks navigation active for locale-prefixed project paths", () => {
    const projectId = "proj_1";
    const filesHref = buildProjectPath("acme", projectId, "files");

    expect(
      isNavigationItemActive("/en/org/acme/projects/proj_1/files", filesHref, {
        organizationSlug: "acme",
        projectId,
      }),
    ).toBe(true);
  });

  it("keeps project overview active state exact for encoded external project ids", () => {
    const projectId = "ext:crowdin:902807";
    const overviewHref = buildProjectPath("hyperlocalise", projectId);
    const filesPath = buildProjectPath("hyperlocalise", projectId, "files");

    expect(
      isNavigationItemActive(filesPath, overviewHref, {
        organizationSlug: "hyperlocalise",
        projectId,
      }),
    ).toBe(false);
    expect(
      isNavigationItemActive(overviewHref, overviewHref, {
        organizationSlug: "hyperlocalise",
        projectId,
      }),
    ).toBe(true);
  });

  it("marks only the matching project subpage active", () => {
    const projectId = "proj_1";
    const filesHref = buildProjectPath("acme", projectId, "files");
    const jobsHref = buildProjectPath("acme", projectId, "jobs");

    expect(
      isNavigationItemActive(filesHref, filesHref, {
        organizationSlug: "acme",
        projectId,
      }),
    ).toBe(true);
    expect(
      isNavigationItemActive(filesHref, jobsHref, {
        organizationSlug: "acme",
        projectId,
      }),
    ).toBe(false);
  });
});

describe("workspace people navigation", () => {
  it("marks teams active for team detail routes", () => {
    const teamsHref = "/org/acme/teams";

    expect(isNavigationItemActive("/org/acme/teams", teamsHref)).toBe(true);
    expect(isNavigationItemActive("/org/acme/teams/team_1", teamsHref)).toBe(true);
    expect(isNavigationItemActive("/org/acme/members", teamsHref)).toBe(false);
  });

  it("marks members active only on members routes", () => {
    const membersHref = "/org/acme/members";

    expect(isNavigationItemActive("/org/acme/members", membersHref)).toBe(true);
    expect(isNavigationItemActive("/en/org/acme/members", membersHref)).toBe(true);
    expect(isNavigationItemActive("/org/acme/teams", membersHref)).toBe(false);
    expect(isNavigationItemActive("/org/acme/teams/team_1", membersHref)).toBe(false);
  });

  it("does not mark settings active on members routes", () => {
    const settingsHref = "/org/acme/settings";

    expect(isNavigationItemActive("/org/acme/members", settingsHref)).toBe(false);
    expect(isNavigationItemActive("/org/acme/settings/account", settingsHref)).toBe(true);
  });

  it("handles missing pathnames safely", () => {
    expect(stripAppLocalePrefix(null)).toBe("/");
    expect(stripAppLocalePrefix(undefined)).toBe("/");
    expect(isNavigationItemActive(null, "/org/acme/teams")).toBe(false);
    expect(isNavigationItemActive(undefined, "/org/acme/teams")).toBe(false);
    expect(isNavigationItemActive("", "/org/acme/teams")).toBe(false);
  });
});

describe("path builders", () => {
  it("builds organization paths", () => {
    expect(buildOrganizationPath("acme", "inbox")).toBe("/org/acme/inbox");
  });

  it("builds project paths with and without a section", () => {
    expect(buildProjectPath("acme", "proj_1")).toBe("/org/acme/projects/proj_1");
    expect(buildProjectPath("acme", "proj_1", "files")).toBe("/org/acme/projects/proj_1/files");
  });

  it("encodes reserved characters in the project id segment", () => {
    expect(buildProjectPath("acme", "ext:crowdin:1", "jobs")).toBe(
      "/org/acme/projects/ext%3Acrowdin%3A1/jobs",
    );
  });

  it("builds global navigation groups scoped to the organization", () => {
    const groups = buildGlobalNavigationGroups("acme");
    const items = groups.flatMap((group) => group.items);
    const byLabel = new Map(items.map((item) => [item.label, item]));

    expect(byLabel.get("Inbox")?.href).toBe("/org/acme/inbox");
    expect(byLabel.get("Projects")?.href).toBe("/org/acme/projects");
    expect(byLabel.get("Automations")?.featureFlagKey).toBe(WORKSPACE_AUTOMATIONS_FLAG);
    expect(byLabel.get("Knowledge")?.featureFlagKey).toBe(WORKSPACE_KNOWLEDGE_FLAG);
  });

  it("builds project navigation items scoped to the project", () => {
    const items = buildProjectNavigationItems("acme", "proj_1");

    expect(items.map((item) => [item.label, item.href])).toEqual([
      ["Overview", "/org/acme/projects/proj_1"],
      ["Files", "/org/acme/projects/proj_1/files"],
      ["Jobs", "/org/acme/projects/proj_1/jobs"],
      ["Issue Sheet", "/org/acme/projects/proj_1/issue-sheet"],
      ["Settings", "/org/acme/projects/proj_1/settings"],
    ]);
  });
});

describe("stripAppLocalePrefix", () => {
  it("removes a supported locale prefix", () => {
    expect(stripAppLocalePrefix("/en/org/acme/inbox")).toBe("/org/acme/inbox");
  });

  it("collapses a locale-only path to root", () => {
    expect(stripAppLocalePrefix("/en")).toBe("/");
    expect(stripAppLocalePrefix("/en/")).toBe("/");
  });

  it("strips trailing slashes after removing the locale", () => {
    expect(stripAppLocalePrefix("/en/org/acme/inbox/")).toBe("/org/acme/inbox");
  });

  it("leaves paths without a locale prefix untouched", () => {
    expect(stripAppLocalePrefix("/org/acme/inbox")).toBe("/org/acme/inbox");
    expect(stripAppLocalePrefix("/fr/org/acme/inbox")).toBe("/fr/org/acme/inbox");
  });

  it("removes newly supported locale prefixes", () => {
    expect(stripAppLocalePrefix("/fr-FR/org/acme/inbox")).toBe("/org/acme/inbox");
    expect(stripAppLocalePrefix("/zh-CN/blog")).toBe("/blog");
  });
});

describe("parseProjectRoute", () => {
  it("returns null for empty and non-project routes", () => {
    expect(parseProjectRoute(null)).toBeNull();
    expect(parseProjectRoute("")).toBeNull();
    expect(parseProjectRoute("/org/acme/inbox")).toBeNull();
    expect(parseProjectRoute("/org/acme/projects")).toBeNull();
  });

  it("returns a null section for the project overview route", () => {
    expect(parseProjectRoute("/org/acme/projects/proj_1")).toEqual({
      organizationSlug: "acme",
      projectId: "proj_1",
      section: null,
    });
  });

  it("only reports the first section segment for nested routes", () => {
    expect(parseProjectRoute("/org/acme/projects/proj_1/jobs/job_1/strings")).toEqual({
      organizationSlug: "acme",
      projectId: "proj_1",
      section: "jobs",
    });
  });
});

describe("isNavigationItemActive", () => {
  it("matches exactly when the exact option is set", () => {
    expect(isNavigationItemActive("/org/acme/inbox", "/org/acme/inbox", { exact: true })).toBe(
      true,
    );
    expect(
      isNavigationItemActive("/org/acme/inbox/thread_1", "/org/acme/inbox", { exact: true }),
    ).toBe(false);
  });

  it("matches nested subpaths for non-exact items", () => {
    expect(isNavigationItemActive("/org/acme/inbox/thread_1", "/org/acme/inbox")).toBe(true);
  });

  it("ignores the hash fragment on the item href", () => {
    expect(isNavigationItemActive("/org/acme/settings", "/org/acme/settings#profile")).toBe(true);
  });

  it("keeps the projects list inactive on project detail routes", () => {
    expect(isNavigationItemActive("/org/acme/projects", "/org/acme/projects")).toBe(true);
    expect(isNavigationItemActive("/org/acme/projects/proj_1", "/org/acme/projects")).toBe(false);
    expect(isNavigationItemActive("/org/acme/projects/proj_1/files", "/org/acme/projects")).toBe(
      false,
    );
  });

  it("treats my-work and my-jobs as the same destination", () => {
    const myWorkHref = "/org/acme/my-work";

    expect(isNavigationItemActive("/org/acme/my-work", myWorkHref)).toBe(true);
    expect(isNavigationItemActive("/org/acme/my-jobs", myWorkHref)).toBe(true);
    expect(isNavigationItemActive("/org/acme/my-jobs/job_1", myWorkHref)).toBe(true);
    expect(isNavigationItemActive("/en/org/acme/my-jobs", myWorkHref)).toBe(true);
    expect(isNavigationItemActive("/org/acme/inbox", myWorkHref)).toBe(false);
  });
});
