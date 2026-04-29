const ROUTE_TITLES = {
  account: "Account",
  agent: "Agent",
  billing: "Billing",
  context: "Context",
  dashboard: "Analytics",
  glossaries: "Glossaries",
  inbox: "Inbox",
  integrations: "Integrations",
  jobs: "Jobs",
  notifications: "Notifications",
  projects: "Projects",
  settings: "Settings",
  "translation-memories": "Translation Memories",
} as const;

function isRouteTitleKey(value: string): value is keyof typeof ROUTE_TITLES {
  return value in ROUTE_TITLES;
}

export function getAppShellTitle(pathname: string | null): string {
  if (!pathname) {
    return ROUTE_TITLES.dashboard;
  }

  const segments = pathname.split("/").filter(Boolean);
  const organizationIndex = segments.indexOf("org");
  const routeSegments = organizationIndex >= 0 ? segments.slice(organizationIndex + 2) : segments;
  const [section, subsection] = routeSegments;

  if (section === "settings" && subsection) {
    return isRouteTitleKey(subsection) ? ROUTE_TITLES[subsection] : ROUTE_TITLES.settings;
  }

  return section && isRouteTitleKey(section) ? ROUTE_TITLES[section] : ROUTE_TITLES.dashboard;
}
