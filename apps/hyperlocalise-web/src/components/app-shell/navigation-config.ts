import type { ComponentProps } from "react";
import type { IntlShape } from "react-intl";

import { normalizeAppLocale } from "@/lib/app-i18n/locales";
import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_KNOWLEDGE_FLAG,
} from "@/lib/flags/workos-flag-entities";
import {
  AiBrain01Icon,
  BookOpenTextIcon,
  Chat01Icon,
  ClipboardListIcon,
  DashboardSquare01Icon,
  DatabaseSyncIcon,
  File01Icon,
  FolderKanbanIcon,
  InboxIcon,
  LinkSquare02Icon,
  Settings01Icon,
  Task01Icon,
  UserMultiple02Icon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";

export type NavigationIcon = ComponentProps<typeof HugeiconsIcon>["icon"];

export type NavigationItem = {
  label: string;
  href: string;
  icon: NavigationIcon;
  description?: string;
  badge?: string;
  featureFlagKey?: typeof WORKSPACE_AUTOMATIONS_FLAG | typeof WORKSPACE_KNOWLEDGE_FLAG;
};

export type NavigationGroup = {
  label?: string;
  items: readonly NavigationItem[];
};

export function buildOrganizationPath(organizationSlug: string, section: string) {
  return `/org/${organizationSlug}/${section}`;
}

export function buildProjectPath(organizationSlug: string, projectId: string, section?: string) {
  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}`;
  return section ? `${base}/${section}` : base;
}

export function buildGlobalNavigationGroups(
  organizationSlug: string,
  intl: IntlShape,
): readonly NavigationGroup[] {
  const org = (section: string) => buildOrganizationPath(organizationSlug, section);

  return [
    {
      items: [
        {
          label: intl.formatMessage({
            defaultMessage: "New Request",
            id: "VtO24sqmBM",
            description: "Sidebar navigation item to start a new localisation request",
          }),
          href: org("chat"),
          icon: Chat01Icon,
          description: intl.formatMessage({
            defaultMessage: "Ask the localisation agent to prepare work",
            id: "z45OPLD254",
            description: "Sidebar description for the New Request navigation item",
          }),
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Inbox",
            id: "qYH/VTnW7r",
            description: "Sidebar navigation item for the workspace inbox",
          }),
          href: org("inbox"),
          icon: InboxIcon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "My Jobs",
            id: "7VRqQJwWUI",
            description: "Sidebar navigation item for the current user’s jobs",
          }),
          href: org("my-work"),
          icon: WorkHistoryIcon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Issues",
            id: "olmZvevw/Q",
            description: "Sidebar navigation item for workspace issues",
          }),
          href: org("issues"),
          icon: ClipboardListIcon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Overview",
            id: "M1acCMedpF",
            description: "Sidebar navigation item for the workspace dashboard overview",
          }),
          href: org("dashboard"),
          icon: DashboardSquare01Icon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Automations",
            id: "87mk4HgY5S",
            description: "Sidebar navigation item for workspace automations",
          }),
          href: org("automations"),
          icon: Task01Icon,
          description: intl.formatMessage({
            defaultMessage: "Scheduled and GitHub-triggered deterministic workflows",
            id: "TBagRGINiT",
            description: "Sidebar description for the Automations navigation item",
          }),
          badge: intl.formatMessage({
            defaultMessage: "Beta",
            id: "+WwLLR9+vz",
            description: "Badge shown next to the Automations navigation item",
          }),
          featureFlagKey: WORKSPACE_AUTOMATIONS_FLAG,
        },
      ],
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Workspace",
        id: "VMLVh0fGup",
        description: "Sidebar group label for workspace-level navigation items",
      }),
      items: [
        {
          label: intl.formatMessage({
            defaultMessage: "Projects",
            id: "WXz3UNteSC",
            description: "Sidebar navigation item for the projects list",
          }),
          href: org("projects"),
          icon: FolderKanbanIcon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Knowledge",
            id: "HrKmOaq57x",
            description: "Sidebar navigation item for workspace knowledge",
          }),
          href: org("knowledge"),
          icon: AiBrain01Icon,
          description: intl.formatMessage({
            defaultMessage: "Workspace memory for agents and teams",
            id: "ZFNYMG0eSQ",
            description: "Sidebar description for the Knowledge navigation item",
          }),
          featureFlagKey: WORKSPACE_KNOWLEDGE_FLAG,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Glossaries",
            id: "p2ZEW4INMa",
            description: "Sidebar navigation item for glossaries",
          }),
          href: org("glossaries"),
          icon: BookOpenTextIcon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Translation Memories",
            id: "x6PqOisw0g",
            description: "Sidebar navigation item for translation memories",
          }),
          href: org("translation-memories"),
          icon: DatabaseSyncIcon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Integrations",
            id: "lq1y6qqiDK",
            description: "Sidebar navigation item for integrations",
          }),
          href: org("integrations"),
          icon: LinkSquare02Icon,
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Members",
            id: "1/YUf106Rt",
            description: "Sidebar navigation item for workspace members",
          }),
          href: org("members"),
          icon: UserMultiple02Icon,
          description: intl.formatMessage({
            defaultMessage: "Invite people and manage workspace roles",
            id: "blLcFpSkB4",
            description: "Sidebar description for the Members navigation item",
          }),
        },
        {
          label: intl.formatMessage({
            defaultMessage: "Settings",
            id: "3cDDnXngWu",
            description: "Sidebar navigation item for workspace settings",
          }),
          href: org("settings"),
          icon: Settings01Icon,
        },
      ],
    },
  ] as const;
}

export function buildProjectNavigationItems(
  organizationSlug: string,
  projectId: string,
  intl: IntlShape,
): readonly NavigationItem[] {
  const project = (section: string) => buildProjectPath(organizationSlug, projectId, section);

  return [
    {
      label: intl.formatMessage({
        defaultMessage: "Overview",
        id: "w6stmLL+C3",
        description: "Project sidebar navigation item for the project overview",
      }),
      href: buildProjectPath(organizationSlug, projectId),
      icon: FolderKanbanIcon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Files",
        id: "IMr6sfD/7/",
        description: "Project sidebar navigation item for project files",
      }),
      href: project("files"),
      icon: File01Icon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Jobs",
        id: "8HNfmSDv7C",
        description: "Project sidebar navigation item for project jobs",
      }),
      href: project("jobs"),
      icon: Task01Icon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Issue Sheet",
        id: "rDacSGpJfq",
        description: "Project sidebar navigation item for the project issue sheet",
      }),
      href: project("issue-sheet"),
      icon: ClipboardListIcon,
    },
    {
      label: intl.formatMessage({
        defaultMessage: "Settings",
        id: "Ly3jSjXVvC",
        description: "Project sidebar navigation item for project settings",
      }),
      href: project("settings"),
      icon: Settings01Icon,
    },
  ] as const;
}

export function stripAppLocalePrefix(pathname: string | null | undefined) {
  if (!pathname) {
    return "/";
  }

  const [, firstSegment, ...rest] = pathname.split("/");
  const locale = firstSegment ? normalizeAppLocale(firstSegment) : null;

  if (!locale) {
    return pathname;
  }

  return `/${rest.join("/")}`.replace(/\/+$/, "") || "/";
}

export function parseProjectRoute(pathname: string | null) {
  if (!pathname) return null;

  const match = stripAppLocalePrefix(pathname).match(
    /^\/org\/([^/]+)\/projects\/([^/]+)(?:\/(.*))?$/,
  );
  if (!match) return null;

  const [, organizationSlug, projectIdSegment, remainder] = match;
  const section = remainder?.split("/").filter(Boolean)[0] ?? null;

  return {
    organizationSlug,
    projectId: decodePathSegment(projectIdSegment),
    section,
  };
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isNavigationItemActive(
  pathname: string | null | undefined,
  href: string,
  options?: {
    exact?: boolean;
    projectId?: string;
    organizationSlug?: string;
  },
) {
  if (!pathname) {
    return false;
  }

  const normalizedPathname = stripAppLocalePrefix(pathname);
  const itemPathname = href.split("#", 1)[0];

  if (options?.exact) {
    return normalizedPathname === itemPathname;
  }

  if (options?.projectId && options.organizationSlug) {
    const overviewHref = buildProjectPath(options.organizationSlug, options.projectId);
    if (itemPathname === overviewHref) {
      return normalizedPathname === overviewHref;
    }
  }

  if (normalizedPathname === itemPathname) {
    return true;
  }

  if (itemPathname.endsWith("/projects")) {
    return normalizedPathname === itemPathname;
  }

  if (normalizedPathname.startsWith(`${itemPathname}/`)) {
    return true;
  }

  if (
    itemPathname.endsWith("/my-work") &&
    normalizedPathname.startsWith(itemPathname.replace("my-work", "my-jobs"))
  ) {
    return true;
  }

  return false;
}
