const ROUTE_TITLES = {
  account: "Account",
  activity: "Activity",
  "agent-runs": "Agent Runs",
  "api-keys": "API Keys",
  billing: "Billing",
  chat: "New Request",
  "command-center": "Overview",
  dashboard: "Overview",
  files: "Files",
  glossaries: "Glossaries",
  inbox: "Inbox",
  integrations: "Integrations",
  jobs: "Jobs",
  knowledge: "Knowledge",
  locales: "Locales",
  members: "Team",
  "my-jobs": "My Jobs",
  "my-work": "My Jobs",
  "new-request": "New Request",
  projects: "Projects",
  qa: "QA",
  reviews: "Reviews",
  settings: "Settings",
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

function routeTitle(segment: string) {
  return isRouteTitleKey(segment) ? ROUTE_TITLES[segment] : segment;
}

export function getAppShellBreadcrumbs(
  pathname: string | null,
  options?: { projectName?: string },
): AppShellBreadcrumb[] {
  const orgRoute = parseOrgRoute(pathname);
  if (!orgRoute) {
    return [{ label: ROUTE_TITLES["command-center"] }];
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

  if (section === "projects" && subsection) {
    const projectName = options?.projectName?.trim() || (projectSection ? "Project" : "Overview");
    const projectHref = buildOrgPath(organizationSlug, "projects", subsection);

    if (projectSection && isProjectSectionKey(projectSection)) {
      return [
        { label: "Project", href: buildOrgPath(organizationSlug, "projects") },
        { label: projectName, href: projectHref },
        { label: PROJECT_SECTION_TITLES[projectSection] },
      ];
    }

    return [
      { label: "Project", href: buildOrgPath(organizationSlug, "projects") },
      { label: projectName },
    ];
  }

  if (section === "projects") {
    return [{ label: ROUTE_TITLES.projects }];
  }

  if (section && isRouteTitleKey(section)) {
    return [{ label: ROUTE_TITLES[section] }];
  }

  return [{ label: ROUTE_TITLES["command-center"] }];
}

export function getAppShellTitle(pathname: string | null): string {
  const breadcrumbs = getAppShellBreadcrumbs(pathname);
  return breadcrumbs[breadcrumbs.length - 1]?.label ?? ROUTE_TITLES["command-center"];
}
