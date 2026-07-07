const ROUTE_TITLES = {
  account: "Account",
  activity: "Activity",
  "agent-runs": "Agent Runs",
  "api-keys": "API Keys",
  billing: "Billing",
  chat: "New Request",
  dashboard: "Overview",
  files: "Files",
  glossaries: "Glossaries",
  inbox: "Inbox",
  integrations: "Integrations",
  "issue-sheet": "Issue Sheet",
  jobs: "Jobs",
  knowledge: "Knowledge",
  locales: "Locales",
  members: "Members",
  "my-jobs": "My Jobs",
  "my-work": "My Jobs",
  "new-request": "New Request",
  projects: "Projects",
  qa: "QA",
  reviews: "Reviews",
  settings: "Settings",
  teams: "Teams",
  "translation-memories": "Translation Memories",
} as const;

export type AppShellBreadcrumb = {
  label: string;
  href?: string;
};

const PROJECT_SECTION_TITLES = {
  activity: "Activity",
  "agent-runs": "Agent Runs",
  context: "Context",
  files: "Files",
  "issue-sheet": "Issue Sheet",
  jobs: "Jobs",
  locales: "Locales",
  qa: "QA",
  reviews: "Reviews",
  settings: "Settings",
} as const;

function isRouteTitleKey(value: string): value is keyof typeof ROUTE_TITLES {
  return value in ROUTE_TITLES;
}

function isProjectSectionKey(value: string): value is keyof typeof PROJECT_SECTION_TITLES {
  return value in PROJECT_SECTION_TITLES;
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

function routeTitle(segment: string) {
  return isRouteTitleKey(segment) ? ROUTE_TITLES[segment] : segment;
}

export function getAppShellBreadcrumbs(
  pathname: string | null,
  options?: { projectName?: string },
): AppShellBreadcrumb[] {
  const orgRoute = parseOrgRoute(pathname);
  if (!orgRoute) {
    return [{ label: ROUTE_TITLES.dashboard }];
  }

  const { organizationSlug, routeSegments } = orgRoute;
  const [section, subsection, projectSection] = routeSegments;

  if (section === "settings") {
    if (!subsection) {
      return [{ label: ROUTE_TITLES.settings }];
    }

    return [
      { label: ROUTE_TITLES.settings, href: buildOrgPath(organizationSlug, "settings") },
      { label: routeTitle(subsection) },
    ];
  }

  if (section === "teams") {
    if (!subsection) {
      return [{ label: ROUTE_TITLES.teams }];
    }

    return [
      { label: ROUTE_TITLES.teams, href: buildOrgPath(organizationSlug, "teams") },
      { label: decodePathSegment(subsection) },
    ];
  }

  if (section === "members") {
    return [{ label: ROUTE_TITLES.members }];
  }

  if (section === "projects" && subsection) {
    const projectId = decodePathSegment(subsection);
    const projectLabel = options?.projectName?.trim() || projectId;
    const projectHref = buildOrgPath(organizationSlug, "projects", subsection);

    if (projectSection && isProjectSectionKey(projectSection)) {
      return [
        { label: ROUTE_TITLES.projects, href: buildOrgPath(organizationSlug, "projects") },
        { label: projectLabel, href: projectHref },
        { label: PROJECT_SECTION_TITLES[projectSection] },
      ];
    }

    return [
      { label: ROUTE_TITLES.projects, href: buildOrgPath(organizationSlug, "projects") },
      { label: projectLabel },
    ];
  }

  if (section === "projects") {
    return [{ label: ROUTE_TITLES.projects }];
  }

  if (section && isRouteTitleKey(section)) {
    return [{ label: ROUTE_TITLES[section] }];
  }

  return [{ label: ROUTE_TITLES.dashboard }];
}

export function getAppShellTitle(pathname: string | null): string {
  const breadcrumbs = getAppShellBreadcrumbs(pathname);
  return breadcrumbs[breadcrumbs.length - 1]?.label ?? ROUTE_TITLES.dashboard;
}
