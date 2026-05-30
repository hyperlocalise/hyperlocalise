import type { ComponentProps } from "react";
import {
  Activity01Icon,
  AiBrain01Icon,
  BookOpenTextIcon,
  DashboardSquare01Icon,
  DatabaseSyncIcon,
  File01Icon,
  FolderKanbanIcon,
  InboxIcon,
  LinkSquare02Icon,
  Settings01Icon,
  SparklesIcon,
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
};

export type NavigationGroup = {
  label?: string;
  items: readonly NavigationItem[];
};

export function buildOrganizationPath(organizationSlug: string, section: string) {
  return `/org/${organizationSlug}/${section}`;
}

export function buildProjectPath(organizationSlug: string, projectId: string, section?: string) {
  const base = `/org/${organizationSlug}/projects/${projectId}`;
  return section ? `${base}/${section}` : base;
}

export function buildGlobalNavigationGroups(organizationSlug: string): readonly NavigationGroup[] {
  const org = (section: string) => buildOrganizationPath(organizationSlug, section);

  return [
    {
      items: [
        {
          label: "New Request",
          href: org("new-request"),
          icon: SparklesIcon,
          description: "Ask the localisation agent to prepare work",
        },
        {
          label: "Inbox",
          href: org("inbox"),
          icon: InboxIcon,
        },
        {
          label: "My Work",
          href: org("my-work"),
          icon: WorkHistoryIcon,
        },
        {
          label: "Command Center",
          href: org("command-center"),
          icon: DashboardSquare01Icon,
        },
        {
          label: "Projects",
          href: org("projects"),
          icon: FolderKanbanIcon,
        },
      ],
    },
    {
      label: "Workspace",
      items: [
        {
          label: "Knowledge",
          href: org("knowledge"),
          icon: AiBrain01Icon,
          description: "Workspace memory for agents and teams",
        },
        {
          label: "Context Sources",
          href: org("context"),
          icon: File01Icon,
        },
        {
          label: "Terminology",
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
          label: "Team",
          href: org("settings/members"),
          icon: UserGroupIcon,
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
      label: "Locales",
      href: project("locales"),
      icon: BookOpenTextIcon,
    },
    {
      label: "Jobs",
      href: project("jobs"),
      icon: Task01Icon,
    },
    {
      label: "Reviews",
      href: project("reviews"),
      icon: InboxIcon,
    },
    {
      label: "Context",
      href: project("context"),
      icon: File01Icon,
    },
    {
      label: "QA",
      href: project("qa"),
      icon: AiBrain01Icon,
    },
    {
      label: "Agent Runs",
      href: project("agent-runs"),
      icon: SparklesIcon,
    },
    {
      label: "Activity",
      href: project("activity"),
      icon: Activity01Icon,
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

  const [, organizationSlug, projectId, remainder] = match;
  const section = remainder?.split("/").filter(Boolean)[0] ?? null;

  return {
    organizationSlug,
    projectId,
    section,
  };
}
