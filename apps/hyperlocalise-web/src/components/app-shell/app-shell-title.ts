/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ReactNode } from "react";
import type { IntlShape } from "react-intl";

import { isDomainResearchSurface } from "@/lib/domains/research-prototype";

import { buildDomainPath } from "./navigation-config";

export type AppShellBreadcrumb = {
  label: string;
  href?: string;
  title?: string;
  isLoading?: boolean;
  render?: () => ReactNode;
};

type RouteTitleKey =
  | "account"
  | "activity"
  | "activity-logs"
  | "agent-runs"
  | "ai-engine"
  | "api-keys"
  | "automations"
  | "audiences"
  | "billing"
  | "dashboard"
  | "dictionaries"
  | "domains"
  | "experiments"
  | "files"
  | "flags"
  | "glossaries"
  | "hyperlab"
  | "inbox"
  | "integrations"
  | "issues"
  | "issue-sheet"
  | "jobs"
  | "keywords"
  | "keys"
  | "knowledge"
  | "linked-domains"
  | "locales"
  | "members"
  | "my-jobs"
  | "my-work"
  | "overview"
  | "permissions"
  | "prompts"
  | "projects"
  | "ranks"
  | "brand"
  | "qa"
  | "reviews"
  | "settings"
  | "strings"
  | "teams"
  | "translation-memories";

const PROJECT_SECTION_KEYS = {
  activity: true,
  "agent-runs": true,
  automations: true,
  context: true,
  files: true,
  "issue-sheet": true,
  jobs: true,
  knowledge: true,
  locales: true,
  qa: true,
  reviews: true,
  settings: true,
  strings: true,
} as const;

const HYPERLAB_SECTION_KEYS = {
  audiences: true,
  experiments: true,
  flags: true,
  keys: true,
} as const;

type ProjectSectionKey = keyof typeof PROJECT_SECTION_KEYS;
type HyperlabSectionKey = keyof typeof HYPERLAB_SECTION_KEYS;

function isRouteTitleKey(value: string): value is RouteTitleKey {
  return (
    value === "account" ||
    value === "activity" ||
    value === "activity-logs" ||
    value === "agent-runs" ||
    value === "ai-engine" ||
    value === "api-keys" ||
    value === "automations" ||
    value === "audiences" ||
    value === "billing" ||
    value === "dashboard" ||
    value === "dictionaries" ||
    value === "domains" ||
    value === "experiments" ||
    value === "files" ||
    value === "flags" ||
    value === "glossaries" ||
    value === "hyperlab" ||
    value === "inbox" ||
    value === "integrations" ||
    value === "issues" ||
    value === "issue-sheet" ||
    value === "jobs" ||
    value === "keywords" ||
    value === "keys" ||
    value === "knowledge" ||
    value === "linked-domains" ||
    value === "locales" ||
    value === "members" ||
    value === "my-jobs" ||
    value === "my-work" ||
    value === "overview" ||
    value === "permissions" ||
    value === "prompts" ||
    value === "projects" ||
    value === "ranks" ||
    value === "brand" ||
    value === "qa" ||
    value === "reviews" ||
    value === "settings" ||
    value === "strings" ||
    value === "teams" ||
    value === "translation-memories"
  );
}

function isProjectSectionKey(value: string): value is ProjectSectionKey {
  return value in PROJECT_SECTION_KEYS;
}

function isHyperlabSectionKey(value: string): value is HyperlabSectionKey {
  return value in HYPERLAB_SECTION_KEYS;
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
    case "activity-logs":
      return intl.formatMessage({
        defaultMessage: "Activity logs",
        id: "B6VzK5q3GO",
        description: "App shell breadcrumb title for the activity logs settings page",
      });
    case "agent-runs":
      return intl.formatMessage({
        defaultMessage: "Agent Runs",
        id: "2he28Pg1K2",
        description: "App shell breadcrumb title for the agent runs page",
      });
    case "ai-engine":
      return intl.formatMessage({
        defaultMessage: "AI Engine",
        id: "lfPogGpRYm",
        description: "App shell breadcrumb title for the AI Engine page",
      });
    case "api-keys":
      return intl.formatMessage({
        defaultMessage: "API keys",
        id: "XRHW9DFjAT",
        description: "App shell breadcrumb title for the API keys settings page",
      });
    case "audiences":
      return intl.formatMessage({
        defaultMessage: "Audiences",
        id: "pMWGh46Ptt",
        description: "App shell breadcrumb title for the Hyperlab audiences page",
      });
    case "billing":
      return intl.formatMessage({
        defaultMessage: "Billing",
        id: "Rn6kkInOe/",
        description: "App shell breadcrumb title for the billing settings page",
      });
    case "dashboard":
      return intl.formatMessage({
        defaultMessage: "Overview",
        id: "cQIBb8VVUr",
        description: "App shell breadcrumb title for the workspace overview page",
      });
    case "dictionaries":
      return intl.formatMessage({
        defaultMessage: "Dictionaries",
        id: "n7Wp3tL8qK",
        description: "App shell breadcrumb title for the spellcheck dictionaries page",
      });
    case "domains":
      return intl.formatMessage({
        defaultMessage: "Domains",
        id: "GuSsVpTTay",
        description: "App shell breadcrumb title for the domains page",
      });
    case "experiments":
      return intl.formatMessage({
        defaultMessage: "Experiments",
        id: "6acz11Hecl",
        description: "App shell breadcrumb title for the Hyperlab experiments page",
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
    case "hyperlab":
      return intl.formatMessage({
        defaultMessage: "Hyperlab",
        id: "xeqCGSaHwJ",
        description: "App shell breadcrumb title for Hyperlab",
      });
    case "flags":
      return intl.formatMessage({
        defaultMessage: "Flags",
        id: "rgJk0uxb7q",
        description: "App shell breadcrumb title for the Hyperlab flags page",
      });
    case "keys":
      return intl.formatMessage({
        defaultMessage: "API keys",
        id: "NxYY7eU7aJ",
        description: "App shell breadcrumb title for the Hyperlab API keys page",
      });
    case "integrations":
      return intl.formatMessage({
        defaultMessage: "Integrations",
        id: "XOLvGAW68Q",
        description: "App shell breadcrumb title for the integrations page",
      });
    case "issues":
      return intl.formatMessage({
        defaultMessage: "Queries",
        id: "3CjBlEDVPl",
        description: "App shell breadcrumb title for the workspace Queries page",
      });
    case "issue-sheet":
      return intl.formatMessage({
        defaultMessage: "Queries",
        id: "RueTypLijF",
        description: "App shell breadcrumb title for the project Queries page",
      });
    case "jobs":
      return intl.formatMessage({
        defaultMessage: "Jobs",
        id: "WzPTL0QId6",
        description: "App shell breadcrumb title for the jobs page",
      });
    case "keywords":
      return intl.formatMessage({
        defaultMessage: "Keywords",
        id: "m6sWTuk4o8",
        description: "App shell breadcrumb title for domain keyword research",
      });
    case "overview":
      return intl.formatMessage({
        defaultMessage: "Overview",
        id: "vum/tkTswv",
        description: "App shell breadcrumb title for domain overview research",
      });
    case "ranks":
      return intl.formatMessage({
        defaultMessage: "Ranks",
        id: "v8HmqsxSuZ",
        description: "App shell breadcrumb title for domain rank tracking",
      });
    case "brand":
      return intl.formatMessage({
        defaultMessage: "Brand",
        id: "QqEr64QiAA",
        description: "App shell breadcrumb title for domain AI brand lookup",
      });
    case "prompts":
      return intl.formatMessage({
        defaultMessage: "Prompts",
        id: "Cx/AirNdqn",
        description: "App shell breadcrumb title for domain prompt explorer",
      });
    case "automations":
      return intl.formatMessage({
        defaultMessage: "Automations",
        id: "I5EnnRppoI",
        description: "App shell breadcrumb title for the automations page",
      });
    case "knowledge":
      return intl.formatMessage({
        defaultMessage: "Guideline",
        id: "1INOkRkMDD",
        description: "App shell breadcrumb title for the guideline page",
      });
    case "linked-domains":
      return intl.formatMessage({
        defaultMessage: "Domains",
        id: "il32pCskAo",
        description: "App shell breadcrumb title for the legacy linked domains settings page",
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
    case "permissions":
      return intl.formatMessage({
        defaultMessage: "Role permissions",
        id: "4C48CjJZ/y",
        description: "App shell breadcrumb title for the role permissions page",
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
    case "strings":
      return intl.formatMessage({
        defaultMessage: "Content Editor",
        id: "Z/xptRbaiC",
        description: "App shell breadcrumb title for the project Content Editor page",
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
  options?: {
    projectName?: string;
    projectNameLoading?: boolean;
    teamName?: string;
    teamNameLoading?: boolean;
    domainName?: string;
    domainNameLoading?: boolean;
  },
): AppShellBreadcrumb[] {
  const orgRoute = parseOrgRoute(pathname);
  if (!orgRoute) {
    return [{ label: formatRouteTitle(intl, "dashboard") }];
  }

  const { organizationSlug, routeSegments } = orgRoute;
  const [section, subsection, projectSection] = routeSegments;

  if (section === "inbox" && subsection === "new") {
    return [
      {
        label: formatRouteTitle(intl, "inbox"),
        href: buildOrgPath(organizationSlug, "inbox"),
      },
      {
        label: intl.formatMessage({
          defaultMessage: "New Request",
          id: "dKBR5NGh7M",
          description: "App shell breadcrumb title for the inbox New Request compose page",
        }),
      },
    ];
  }

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

    const teamId = decodePathSegment(subsection);
    const resolvedTeamName = options?.teamName?.trim();
    const teamNameLoading = options?.teamNameLoading && !resolvedTeamName;
    const teamLabel = resolvedTeamName || (teamNameLoading ? "" : teamId);

    return [
      { label: formatRouteTitle(intl, "teams"), href: buildOrgPath(organizationSlug, "teams") },
      {
        label: teamLabel,
        ...(teamNameLoading ? { isLoading: true } : {}),
      },
    ];
  }

  if (section === "domains") {
    if (!subsection) {
      return [{ label: formatRouteTitle(intl, "domains") }];
    }

    const linkedDomainId = decodePathSegment(subsection);
    const resolvedDomainName = options?.domainName?.trim();
    const domainNameLoading = options?.domainNameLoading && !resolvedDomainName;
    const domainLabel = resolvedDomainName || (domainNameLoading ? "" : linkedDomainId);
    const surface =
      projectSection && isDomainResearchSurface(projectSection) ? projectSection : undefined;

    const crumbs: AppShellBreadcrumb[] = [
      {
        label: formatRouteTitle(intl, "domains"),
        href: buildOrgPath(organizationSlug, "domains"),
      },
      {
        label: domainLabel,
        ...(surface ? { href: buildDomainPath(organizationSlug, linkedDomainId) } : {}),
        ...(domainNameLoading ? { isLoading: true } : {}),
      },
    ];

    if (surface) {
      crumbs.push({ label: formatRouteTitle(intl, surface) });
    }

    return crumbs;
  }

  if (section === "members") {
    if (!subsection) {
      return [{ label: formatRouteTitle(intl, "members") }];
    }

    return [
      {
        label: formatRouteTitle(intl, "members"),
        href: buildOrgPath(organizationSlug, "members"),
      },
      { label: routeTitle(intl, subsection) },
    ];
  }

  if (section === "projects" && subsection) {
    const projectId = decodePathSegment(subsection);
    const resolvedProjectName = options?.projectName?.trim();
    const projectNameLoading = options?.projectNameLoading && !resolvedProjectName;
    const projectLabel = resolvedProjectName || (projectNameLoading ? "" : projectId);
    const projectHref = buildOrgPath(organizationSlug, "projects", subsection);
    const projectCrumb: AppShellBreadcrumb = {
      label: projectLabel,
      ...(projectNameLoading ? { isLoading: true } : {}),
    };
    const issueIdSegment = routeSegments[3];

    if (projectSection && isProjectSectionKey(projectSection)) {
      const sectionHref = buildOrgPath(organizationSlug, "projects", subsection, projectSection);
      return [
        {
          label: formatRouteTitle(intl, "projects"),
          href: buildOrgPath(organizationSlug, "projects"),
        },
        { ...projectCrumb, href: projectHref },
        {
          label: formatProjectSectionTitle(intl, projectSection),
          href: issueIdSegment ? sectionHref : undefined,
        },
      ];
    }

    return [
      {
        label: formatRouteTitle(intl, "projects"),
        href: buildOrgPath(organizationSlug, "projects"),
      },
      projectCrumb,
    ];
  }

  if (section === "projects") {
    return [{ label: formatRouteTitle(intl, "projects") }];
  }

  if (section === "hyperlab") {
    if (!subsection) {
      return [{ label: formatRouteTitle(intl, "hyperlab") }];
    }

    const crumbs: AppShellBreadcrumb[] = [
      {
        label: formatRouteTitle(intl, "hyperlab"),
        href: buildOrgPath(organizationSlug, "hyperlab"),
      },
    ];

    if (isHyperlabSectionKey(subsection)) {
      crumbs.push({
        label: formatRouteTitle(intl, subsection),
      });
    }

    return crumbs;
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
