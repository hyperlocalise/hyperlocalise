import type { ComponentProps } from "react";
import {
  AiBrain01Icon,
  BookOpenTextIcon,
  Chat01Icon,
  DashboardSquare01Icon,
  DatabaseSyncIcon,
  File01Icon,
  FolderKanbanIcon,
  InboxIcon,
  LinkSquare02Icon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
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
          href: org("command-center"),
          icon: DashboardSquare01Icon,
        },
        {
          label: "Automations",
          href: org("automations"),
          icon: Task01Icon,
          description: "Scheduled and GitHub-triggered deterministic workflows",
          badge: "Beta",
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
          badge: "Coming soon",
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
          label: "Teams",
          href: org("teams"),
          icon: UserGroupIcon,
          description: "Create teams and assign workspace members",
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
      label: "Settings",
      href: project("settings"),
      icon: Settings01Icon,
    },
  ] as const;
}

export function parseProjectRoute(pathname: string | null) {
  if (!pathname) return null;

  const match = pathname.match(/^\/org\/([^/]+)\/projects\/([^/]+)(?:\/(.*))?$/);
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
  pathname: string,
  href: string,
  options?: {
    exact?: boolean;
    projectId?: string;
    organizationSlug?: string;
  },
) {
  const itemPathname = href.split("#", 1)[0];

  if (options?.exact) {
    return pathname === itemPathname;
  }

  if (options?.projectId && options.organizationSlug) {
    const overviewHref = buildProjectPath(options.organizationSlug, options.projectId);
    if (itemPathname === overviewHref) {
      return pathname === overviewHref;
    }
  }

  if (pathname === itemPathname) {
    return true;
  }

  if (itemPathname.endsWith("/projects")) {
    return pathname === itemPathname;
  }

  if (pathname.startsWith(`${itemPathname}/`)) {
    if (itemPathname.endsWith("/settings")) {
      const settingsSubpath = pathname.slice(itemPathname.length + 1);
      if (settingsSubpath === "members" || settingsSubpath.startsWith("members/")) {
        return false;
      }
    }
    return true;
  }

  if (
    itemPathname.endsWith("/command-center") &&
    pathname.startsWith(itemPathname.replace("command-center", "dashboard"))
  ) {
    return true;
  }

  if (
    itemPathname.endsWith("/my-work") &&
    pathname.startsWith(itemPathname.replace("my-work", "my-jobs"))
  ) {
    return true;
  }

  return false;
}
