import type { IntlShape } from "react-intl";

export type AppShellBreadcrumb = {
  label: string;
  href?: string;
};

type RouteTitleKey =
  | "account"
  | "activity"
  | "agent-runs"
  | "api-keys"
  | "billing"
  | "chat"
  | "dashboard"
  | "files"
  | "glossaries"
  | "inbox"
  | "integrations"
  | "issues"
  | "issue-sheet"
  | "jobs"
  | "knowledge"
  | "locales"
  | "members"
  | "my-jobs"
  | "my-work"
  | "new-request"
  | "projects"
  | "qa"
  | "reviews"
  | "settings"
  | "teams"
  | "translation-memories";

type ProjectSectionKey =
  | "activity"
  | "agent-runs"
  | "context"
  | "files"
  | "issue-sheet"
  | "jobs"
  | "locales"
  | "qa"
  | "reviews"
  | "settings";

function isRouteTitleKey(value: string): value is RouteTitleKey {
  return (
    value === "account" ||
    value === "activity" ||
    value === "agent-runs" ||
    value === "api-keys" ||
    value === "billing" ||
    value === "chat" ||
    value === "dashboard" ||
    value === "files" ||
    value === "glossaries" ||
    value === "inbox" ||
    value === "integrations" ||
    value === "issues" ||
    value === "issue-sheet" ||
    value === "jobs" ||
    value === "knowledge" ||
    value === "locales" ||
    value === "members" ||
    value === "my-jobs" ||
    value === "my-work" ||
    value === "new-request" ||
    value === "projects" ||
    value === "qa" ||
    value === "reviews" ||
    value === "settings" ||
    value === "teams" ||
    value === "translation-memories"
  );
}

function isProjectSectionKey(value: string): value is ProjectSectionKey {
  return (
    value === "activity" ||
    value === "agent-runs" ||
    value === "context" ||
    value === "files" ||
    value === "issue-sheet" ||
    value === "jobs" ||
    value === "locales" ||
    value === "qa" ||
    value === "reviews" ||
    value === "settings"
  );
}

function parseOrgRoute(pathname: string | null) {
  if (!pathname) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  const organizationIndex = segments.indexOf("org");
  if (organizationIndex < 0) {
    return null;
  }

  const organizationSlug = segments[organizationIndex + 1];
  if (!organizationSlug) {
    return null;
  }

  return {
    organizationSlug,
    routeSegments: segments.slice(organizationIndex + 2),
  };
}

function buildOrgPath(organizationSlug: string, ...parts: string[]) {
  return `/org/${organizationSlug}/${parts.join("/")}`;
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function routeTitle(intl: IntlShape, segment: string) {
  return isRouteTitleKey(segment) ? formatRouteTitle(intl, segment) : segment;
}

function formatRouteTitle(intl: IntlShape, key: RouteTitleKey): string {
  switch (key) {
    case "account":
      return intl.formatMessage({
        defaultMessage: "Account",
        id: "tMPM8tkhJg",
        description: "App shell breadcrumb title for the account settings page",
      });
    case "activity":
      return intl.formatMessage({
        defaultMessage: "Activity",
        id: "rW0O4vxb9w",
        description: "App shell breadcrumb title for the activity page",
      });
    case "agent-runs":
      return intl.formatMessage({
        defaultMessage: "Agent Runs",
        id: "2he28Pg1K2",
        description: "App shell breadcrumb title for the agent runs page",
      });
    case "api-keys":
      return intl.formatMessage({
        defaultMessage: "API Keys",
        id: "BuW96vtm0m",
        description: "App shell breadcrumb title for the API keys settings page",
      });
    case "billing":
      return intl.formatMessage({
        defaultMessage: "Billing",
        id: "Rn6kkInOe/",
        description: "App shell breadcrumb title for the billing settings page",
      });
    case "chat":
    case "new-request":
      return intl.formatMessage({
        defaultMessage: "New Request",
        id: "iC/MBnVVSN",
        description: "App shell breadcrumb title for the new request page",
      });
    case "dashboard":
      return intl.formatMessage({
        defaultMessage: "Overview",
        id: "cQIBb8VVUr",
        description: "App shell breadcrumb title for the workspace overview page",
      });
    case "files":
      return intl.formatMessage({
        defaultMessage: "Files",
        id: "CGit9CSACq",
        description: "App shell breadcrumb title for the files page",
      });
    case "glossaries":
      return intl.formatMessage({
        defaultMessage: "Glossaries",
        id: "Qbn+bjzsz0",
        description: "App shell breadcrumb title for the glossaries page",
      });
    case "inbox":
      return intl.formatMessage({
        defaultMessage: "Inbox",
        id: "2f2Oa8dJQI",
        description: "App shell breadcrumb title for the inbox page",
      });
    case "integrations":
      return intl.formatMessage({
        defaultMessage: "Integrations",
        id: "XOLvGAW68Q",
        description: "App shell breadcrumb title for the integrations page",
      });
    case "issues":
      return intl.formatMessage({
        defaultMessage: "Issues",
        id: "RtEbYHhw1P",
        description: "App shell breadcrumb title for the issues page",
      });
    case "issue-sheet":
      return intl.formatMessage({
        defaultMessage: "Issue Sheet",
        id: "FRn2vWc0wk",
        description: "App shell breadcrumb title for the issue sheet page",
      });
    case "jobs":
      return intl.formatMessage({
        defaultMessage: "Jobs",
        id: "WzPTL0QId6",
        description: "App shell breadcrumb title for the jobs page",
      });
    case "knowledge":
      return intl.formatMessage({
        defaultMessage: "Knowledge",
        id: "T+wQxH/IG1",
        description: "App shell breadcrumb title for the knowledge page",
      });
    case "locales":
      return intl.formatMessage({
        defaultMessage: "Locales",
        id: "s+WyHO3V5f",
        description: "App shell breadcrumb title for the locales page",
      });
    case "members":
      return intl.formatMessage({
        defaultMessage: "Members",
        id: "p97Cor56nd",
        description: "App shell breadcrumb title for the members page",
      });
    case "my-jobs":
    case "my-work":
      return intl.formatMessage({
        defaultMessage: "My Jobs",
        id: "YM1jd5PwaY",
        description: "App shell breadcrumb title for the my jobs page",
      });
    case "projects":
      return intl.formatMessage({
        defaultMessage: "Projects",
        id: "A0qlCRVH2r",
        description: "App shell breadcrumb title for the projects page",
      });
    case "qa":
      return intl.formatMessage({
        defaultMessage: "QA",
        id: "A4tXh3Cw8D",
        description: "App shell breadcrumb title for the QA page",
      });
    case "reviews":
      return intl.formatMessage({
        defaultMessage: "Reviews",
        id: "2uwHtwT4Tc",
        description: "App shell breadcrumb title for the reviews page",
      });
    case "settings":
      return intl.formatMessage({
        defaultMessage: "Settings",
        id: "5Xs2gSCUMi",
        description: "App shell breadcrumb title for the settings page",
      });
    case "teams":
      return intl.formatMessage({
        defaultMessage: "Teams",
        id: "LD3YSKplTh",
        description: "App shell breadcrumb title for the teams page",
      });
    case "translation-memories":
      return intl.formatMessage({
        defaultMessage: "Translation Memories",
        id: "vbaH3BSX3d",
        description: "App shell breadcrumb title for the translation memories page",
      });
  }
}

function formatProjectSectionTitle(intl: IntlShape, key: ProjectSectionKey): string {
  if (key === "context") {
    return intl.formatMessage({
      defaultMessage: "Context",
      id: "FkLEYWNws0",
      description: "App shell breadcrumb title for a project context section",
    });
  }

  return formatRouteTitle(intl, key);
}

export function getAppShellBreadcrumbs(
  pathname: string | null,
  intl: IntlShape,
  options?: { projectName?: string },
): AppShellBreadcrumb[] {
  const orgRoute = parseOrgRoute(pathname);
  if (!orgRoute) {
    return [{ label: formatRouteTitle(intl, "dashboard") }];
  }

  const { organizationSlug, routeSegments } = orgRoute;
  const [section, subsection, projectSection] = routeSegments;

  if (section === "settings") {
    if (!subsection) {
      return [{ label: formatRouteTitle(intl, "settings") }];
    }

    return [
      {
        label: formatRouteTitle(intl, "settings"),
        href: buildOrgPath(organizationSlug, "settings"),
      },
      { label: routeTitle(intl, subsection) },
    ];
  }

  if (section === "teams") {
    if (!subsection) {
      return [{ label: formatRouteTitle(intl, "teams") }];
    }

    return [
      { label: formatRouteTitle(intl, "teams"), href: buildOrgPath(organizationSlug, "teams") },
      { label: decodePathSegment(subsection) },
    ];
  }

  if (section === "members") {
    return [{ label: formatRouteTitle(intl, "members") }];
  }

  if (section === "projects" && subsection) {
    const projectId = decodePathSegment(subsection);
    const projectLabel = options?.projectName?.trim() || projectId;
    const projectHref = buildOrgPath(organizationSlug, "projects", subsection);

    if (projectSection && isProjectSectionKey(projectSection)) {
      return [
        {
          label: formatRouteTitle(intl, "projects"),
          href: buildOrgPath(organizationSlug, "projects"),
        },
        { label: projectLabel, href: projectHref },
        { label: formatProjectSectionTitle(intl, projectSection) },
      ];
    }

    return [
      {
        label: formatRouteTitle(intl, "projects"),
        href: buildOrgPath(organizationSlug, "projects"),
      },
      { label: projectLabel },
    ];
  }

  if (section === "projects") {
    return [{ label: formatRouteTitle(intl, "projects") }];
  }

  if (section && isRouteTitleKey(section)) {
    return [{ label: formatRouteTitle(intl, section) }];
  }

  return [{ label: formatRouteTitle(intl, "dashboard") }];
}

export function getAppShellTitle(pathname: string | null, intl: IntlShape): string {
  const breadcrumbs = getAppShellBreadcrumbs(pathname, intl);
  return breadcrumbs[breadcrumbs.length - 1]?.label ?? formatRouteTitle(intl, "dashboard");
}
