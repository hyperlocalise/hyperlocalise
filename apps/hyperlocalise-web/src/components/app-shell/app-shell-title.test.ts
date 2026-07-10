import { describe, expect, it } from "vite-plus/test";
import type { IntlShape } from "react-intl";

import { getIntlShape } from "@/lib/app-i18n/intl";

import { getAppShellBreadcrumbs, getAppShellTitle } from "./app-shell-title";

const intl = getIntlShape("en") as IntlShape;

describe("getAppShellTitle", () => {
  it.each([
    ["/org/acme/dashboard", "Overview"],
    ["/org/acme/inbox", "Inbox"],
    ["/org/acme/new-request", "New Request"],
    ["/org/acme/chat", "New Request"],
    ["/org/acme/projects", "Projects"],
    ["/org/acme/projects/proj_1", "proj_1"],
    ["/org/acme/projects/proj_1/files", "Files"],
    ["/org/acme/projects/proj_1/jobs", "Jobs"],
    ["/org/acme/projects/proj_1/issue-sheet", "Issue Sheet"],
    ["/org/acme/projects/proj_1/agent-runs", "Agent Runs"],
    ["/org/acme/projects/proj_1/activity", "Activity"],
    ["/org/acme/projects/proj_1/context", "Context"],
    ["/org/acme/projects/proj_1/locales", "Locales"],
    ["/org/acme/projects/proj_1/qa", "QA"],
    ["/org/acme/projects/proj_1/reviews", "Reviews"],
    ["/org/acme/projects/proj_1/settings", "Settings"],
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
    expect(getAppShellTitle(pathname, intl)).toBe(title);
  });

  it("falls back to overview for unknown or empty paths", () => {
    expect(getAppShellTitle(null, intl)).toBe("Overview");
    expect(getAppShellTitle("", intl)).toBe("Overview");
    expect(getAppShellTitle("/org/acme/unknown", intl)).toBe("Overview");
  });

  it("falls back to overview when the org slug is missing", () => {
    expect(getAppShellTitle("/org", intl)).toBe("Overview");
    expect(getAppShellTitle("/org/", intl)).toBe("Overview");
    expect(getAppShellTitle("/dashboard", intl)).toBe("Overview");
  });

  it("resolves the title from locale-prefixed paths", () => {
    expect(getAppShellTitle("/en/org/acme/inbox", intl)).toBe("Inbox");
    expect(getAppShellTitle("/en/org/acme/settings/billing", intl)).toBe("Billing");
  });

  it("uses the project id as the title for unknown project sections", () => {
    expect(getAppShellTitle("/org/acme/projects/proj_1/unknown-section", intl)).toBe("proj_1");
  });
});

describe("getAppShellBreadcrumbs", () => {
  it("returns a single crumb for top-level routes", () => {
    expect(getAppShellBreadcrumbs("/org/acme/inbox", intl)).toEqual([{ label: "Inbox" }]);
  });

  it("returns settings breadcrumbs for settings subpages", () => {
    expect(getAppShellBreadcrumbs("/org/acme/settings/account", intl)).toEqual([
      { label: "Settings", href: "/org/acme/settings" },
      { label: "Account" },
    ]);
  });

  it("returns teams breadcrumbs for team detail pages", () => {
    expect(getAppShellBreadcrumbs("/org/acme/teams", intl)).toEqual([{ label: "Teams" }]);
    expect(getAppShellBreadcrumbs("/org/acme/teams/team_1", intl)).toEqual([
      { label: "Teams", href: "/org/acme/teams" },
      { label: "team_1" },
    ]);
  });

  it("returns members breadcrumbs", () => {
    expect(getAppShellBreadcrumbs("/org/acme/members", intl)).toEqual([{ label: "Members" }]);
  });

  it("returns project breadcrumbs with the project name", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1/files", intl, { projectName: "Checkout" }),
    ).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "Checkout", href: "/org/acme/projects/proj_1" },
      { label: "Files" },
    ]);
  });

  it("falls back to the project id when the project name is unavailable", () => {
    expect(getAppShellBreadcrumbs("/org/acme/projects/proj_1/jobs", intl)).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
      { label: "Jobs" },
    ]);
  });

  it("returns issue sheet breadcrumbs for the project issue-sheet section", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1/issue-sheet", intl, {
        projectName: "Checkout",
      }),
    ).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "Checkout", href: "/org/acme/projects/proj_1" },
      { label: "Issue Sheet" },
    ]);
  });

  it("returns project overview breadcrumbs without a section crumb", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1", intl, { projectName: "Checkout" }),
    ).toEqual([{ label: "Projects", href: "/org/acme/projects" }, { label: "Checkout" }]);
    expect(getAppShellBreadcrumbs("/org/acme/projects/proj_1", intl)).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1" },
    ]);
  });

  it("falls back to the dashboard crumb when there is no org route", () => {
    expect(getAppShellBreadcrumbs(null, intl)).toEqual([{ label: "Overview" }]);
    expect(getAppShellBreadcrumbs("", intl)).toEqual([{ label: "Overview" }]);
    expect(getAppShellBreadcrumbs("/org", intl)).toEqual([{ label: "Overview" }]);
    expect(getAppShellBreadcrumbs("/dashboard", intl)).toEqual([{ label: "Overview" }]);
  });

  it("resolves breadcrumbs from locale-prefixed paths", () => {
    expect(getAppShellBreadcrumbs("/en/org/acme/settings/account", intl)).toEqual([
      { label: "Settings", href: "/org/acme/settings" },
      { label: "Account" },
    ]);
  });

  it("returns the settings section verbatim for unknown subsections", () => {
    expect(getAppShellBreadcrumbs("/org/acme/settings/unknown", intl)).toEqual([
      { label: "Settings", href: "/org/acme/settings" },
      { label: "unknown" },
    ]);
  });

  it("decodes encoded team detail segments", () => {
    expect(getAppShellBreadcrumbs("/org/acme/teams/team%20alpha", intl)).toEqual([
      { label: "Teams", href: "/org/acme/teams" },
      { label: "team alpha" },
    ]);
  });

  it("keeps a malformed team segment untouched when it cannot be decoded", () => {
    expect(getAppShellBreadcrumbs("/org/acme/teams/%E0%A4%A", intl)).toEqual([
      { label: "Teams", href: "/org/acme/teams" },
      { label: "%E0%A4%A" },
    ]);
  });

  it("decodes encoded external project ids while keeping hrefs encoded", () => {
    expect(getAppShellBreadcrumbs("/org/acme/projects/ext%3Acrowdin%3A902807/files", intl)).toEqual(
      [
        { label: "Projects", href: "/org/acme/projects" },
        { label: "ext:crowdin:902807", href: "/org/acme/projects/ext%3Acrowdin%3A902807" },
        { label: "Files" },
      ],
    );
  });

  it("ignores unknown project sections and keeps the project crumb", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1/unknown-section", intl, {
        projectName: "Checkout",
      }),
    ).toEqual([{ label: "Projects", href: "/org/acme/projects" }, { label: "Checkout" }]);
  });

  it("falls back to the project id when the project name is only whitespace", () => {
    expect(
      getAppShellBreadcrumbs("/org/acme/projects/proj_1/files", intl, { projectName: "   " }),
    ).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
      { label: "Files" },
    ]);
  });
});
