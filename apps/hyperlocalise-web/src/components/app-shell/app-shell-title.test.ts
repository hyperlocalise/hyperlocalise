import { describe, expect, it } from "vite-plus/test";

import { getAppShellBreadcrumbs, getAppShellTitle } from "./app-shell-title";

describe("getAppShellTitle", () => {
  it.each([
    ["/org/acme/command-center", "Overview"],
    ["/org/acme/dashboard", "Overview"],
    ["/org/acme/inbox", "Inbox"],
    ["/org/acme/new-request", "New Request"],
    ["/org/acme/chat", "New Request"],
    ["/org/acme/projects", "Projects"],
    ["/org/acme/projects/proj_1", "proj_1"],
    ["/org/acme/projects/proj_1/files", "Files"],
    ["/org/acme/projects/proj_1/jobs", "Jobs"],
    ["/org/acme/projects/proj_1/agent-runs", "Agent Runs"],
    ["/org/acme/my-work", "My Jobs"],
    ["/org/acme/my-jobs", "My Jobs"],
    ["/org/acme/knowledge", "Knowledge"],
    ["/org/acme/glossaries", "Glossaries"],
    ["/org/acme/translation-memories", "Translation Memories"],
    ["/org/acme/integrations", "Integrations"],
    ["/org/acme/teams", "Teams"],
    ["/org/acme/teams/team_1", "team_1"],
    ["/org/acme/members", "Members"],
    ["/org/acme/settings", "Settings"],
    ["/org/acme/settings/members", "Members"],
    ["/org/acme/settings/account", "Account"],
    ["/org/acme/settings/billing", "Billing"],
  ])("returns the route title for %s", (pathname, title) => {
    expect(getAppShellTitle(pathname)).toBe(title);
  });

  it("falls back to overview for unknown or empty paths", () => {
    expect(getAppShellTitle(null)).toBe("Overview");
    expect(getAppShellTitle("/org/acme/unknown")).toBe("Overview");
  });
});

describe("getAppShellBreadcrumbs", () => {
  it("returns a single crumb for top-level routes", () => {
    expect(getAppShellBreadcrumbs("/org/acme/inbox")).toEqual([{ label: "Inbox" }]);
  });

  it("returns settings breadcrumbs for settings subpages", () => {
    expect(getAppShellBreadcrumbs("/org/acme/settings/account")).toEqual([
      { label: "Settings", href: "/org/acme/settings" },
      { label: "Account" },
    ]);
  });

  it("returns teams breadcrumbs for team detail pages", () => {
    expect(getAppShellBreadcrumbs("/org/acme/teams")).toEqual([{ label: "Teams" }]);
    expect(getAppShellBreadcrumbs("/org/acme/teams/team_1")).toEqual([
      { label: "Teams", href: "/org/acme/teams" },
      { label: "team_1" },
    ]);
  });

  it("returns members breadcrumbs", () => {
    expect(getAppShellBreadcrumbs("/org/acme/members")).toEqual([{ label: "Members" }]);
  });

  it("returns project breadcrumbs with the project name", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1/files", { projectName: "Checkout" }),
    ).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "Checkout", href: "/org/acme/projects/proj_1" },
      { label: "Files" },
    ]);
  });

  it("falls back to the project id when the project name is unavailable", () => {
    expect(getAppShellBreadcrumbs("/org/acme/projects/proj_1/jobs")).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
      { label: "Jobs" },
    ]);
  });

  it("returns project overview breadcrumbs without a section crumb", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1", { projectName: "Checkout" }),
    ).toEqual([{ label: "Projects", href: "/org/acme/projects" }, { label: "Checkout" }]);
    expect(getAppShellBreadcrumbs("/org/acme/projects/proj_1")).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1" },
    ]);
  });
});
