const ROUTE_TITLES = {
  account: "Account",
  agent: "Agent",
  billing: "Billing",
  dashboard: "Dashboard",
  glossaries: "Glossaries",
  integrations: "Integrations",
  jobs: "Jobs",
  notifications: "Notifications",
  projects: "Projects",
  settings: "Settings",
} as const;

export function getAppShellTitle(pathname: string | null): string {
  if (!pathname) {
    return ROUTE_TITLES.dashboard;
  }

  const segments = pathname.split("/").filter(Boolean);
  const organizationIndex = segments.indexOf("org");
  const routeSegments = organizationIndex >= 0 ? segments.slice(organizationIndex + 2) : segments;
  const [section, subsection] = routeSegments;

  if (section === "settings" && subsection) {
    return ROUTE_TITLES[subsection as keyof typeof ROUTE_TITLES] ?? ROUTE_TITLES.settings;
  }

  return ROUTE_TITLES[section as keyof typeof ROUTE_TITLES] ?? ROUTE_TITLES.dashboard;
}
