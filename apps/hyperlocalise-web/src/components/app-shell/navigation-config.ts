import type { ComponentProps } from "react";

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

export function buildGlobalNavigationGroups(organizationSlug: string): readonly NavigationGroup[] {
  const org = (section: string) => buildOrganizationPath(organizationSlug, section);

  return [
    {
      items: [
        {
          label: "New Request",
          href: org("chat"),
          icon: Chat01Icon,
          description: "Ask the localisation agent to prepare work",
        },
        {
          label: "Inbox",
          href: org("inbox"),
          icon: InboxIcon,
        },
        {
          label: "My Jobs",
          href: org("my-work"),
          icon: WorkHistoryIcon,
        },
        {
          label: "Overview",
          href: org("dashboard"),
          icon: DashboardSquare01Icon,
        },
        {
          label: "Automations",
          href: org("automations"),
          icon: Task01Icon,
          description: "Scheduled and GitHub-triggered deterministic workflows",
          badge: "Beta",
          featureFlagKey: WORKSPACE_AUTOMATIONS_FLAG,
        },
      ],
    },
    {
      label: "Workspace",
      items: [
        {
          label: "Projects",
          href: org("projects"),
          icon: FolderKanbanIcon,
        },
        {
          label: "Knowledge",
          href: org("knowledge"),
          icon: AiBrain01Icon,
          description: "Workspace memory for agents and teams",
          featureFlagKey: WORKSPACE_KNOWLEDGE_FLAG,
        },
        {
          label: "Glossaries",
          href: org("glossaries"),
          icon: BookOpenTextIcon,
        },
        {
          label: "Translation Memories",
          href: org("translation-memories"),
          icon: DatabaseSyncIcon,
        },
        {
          label: "Integrations",
          href: org("integrations"),
          icon: LinkSquare02Icon,
        },
        {
          label: "Members",
          href: org("members"),
          icon: UserMultiple02Icon,
          description: "Invite people and manage workspace roles",
        },
        {
          label: "Settings",
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
): readonly NavigationItem[] {
  const project = (section: string) => buildProjectPath(organizationSlug, projectId, section);

  return [
    {
      label: "Overview",
      href: buildProjectPath(organizationSlug, projectId),
      icon: FolderKanbanIcon,
    },
    {
      label: "Files",
      href: project("files"),
      icon: File01Icon,
    },
    {
      label: "Jobs",
      href: project("jobs"),
      icon: Task01Icon,
    },
    {
      label: "Issue Sheet",
      href: project("issue-sheet"),
      icon: ClipboardListIcon,
    },
    {
      label: "Settings",
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
