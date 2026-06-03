import { describe, expect, it } from "vite-plus/test";

import { buildProjectPath, isNavigationItemActive, parseProjectRoute } from "./navigation-config";

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
