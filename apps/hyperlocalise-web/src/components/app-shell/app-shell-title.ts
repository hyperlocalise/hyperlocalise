const ROUTE_TITLES = {
  account: "Account",
  activity: "Activity",
  "agent-runs": "Agent Runs",
  billing: "Billing",
  "brand-voice": "Brand Voice",
  chat: "New Request",
  "command-center": "Command Center",
  context: "Context Sources",
  dashboard: "Command Center",
  files: "Files",
  glossaries: "Terminology",
  inbox: "Inbox",
  integrations: "Integrations",
  jobs: "Jobs",
  knowledge: "Knowledge",
  locales: "Locales",
  members: "Team",
  "my-jobs": "My Work",
  "my-work": "My Work",
  notifications: "Notifications",
  "new-request": "New Request",
  projects: "Projects",
  qa: "QA",
  reviews: "Reviews",
  settings: "Settings",
  "style-guides": "Style Guides",
  "translation-memories": "Translation Memories",
} as const;

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

export function getAppShellTitle(pathname: string | null): string {
  if (!pathname) {
    return ROUTE_TITLES["command-center"];
  }

  const segments = pathname.split("/").filter(Boolean);
  const organizationIndex = segments.indexOf("org");
  const routeSegments = organizationIndex >= 0 ? segments.slice(organizationIndex + 2) : segments;
  const [section, subsection, projectSection] = routeSegments;

  if (section === "projects" && subsection && projectSection) {
    if (isProjectSectionKey(projectSection)) {
      return PROJECT_SECTION_TITLES[projectSection];
    }
    return "Overview";
  }

  if (section === "projects" && subsection) {
    return "Overview";
  }

  if (section === "settings" && subsection) {
    if (subsection === "members") {
      return ROUTE_TITLES.members;
    }
    return isRouteTitleKey(subsection) ? ROUTE_TITLES[subsection] : ROUTE_TITLES.settings;
  }

  if (section === "knowledge" && subsection && isRouteTitleKey(subsection)) {
    return ROUTE_TITLES[subsection];
  }

  return section && isRouteTitleKey(section)
    ? ROUTE_TITLES[section]
    : ROUTE_TITLES["command-center"];
}
