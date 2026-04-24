import type { ReactNode } from "react";
import {
  BookOpenTextIcon,
  BotIcon,
  DashboardSquare01Icon,
  FolderKanbanIcon,
  LinkSquare02Icon,
  Settings01Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";

import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { AppShellClient } from "@/components/app/app-shell-client";
import { AppShellNavigation } from "@/components/app/app-shell-navigation";

export type AppShellProps = {
  children: ReactNode;
  organizationSlug: string;
};

export async function AppShell({ children, organizationSlug }: AppShellProps) {
  const auth = await requireAppAuthContext({ organizationSlug });
  const activeOrganizationSlug = auth.activeOrganization.slug ?? organizationSlug;

  const displayName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;
  const navigationGroups = [
    {
      label: "Workspace",
      items: [
        {
          label: "Overview",
          href: `/org/${activeOrganizationSlug}/dashboard`,
          icon: DashboardSquare01Icon,
        },
        {
          label: "Projects",
          href: `/org/${activeOrganizationSlug}/projects`,
          icon: FolderKanbanIcon,
        },
        {
          label: "Jobs",
          href: `/org/${activeOrganizationSlug}/jobs`,
          icon: Task01Icon,
        },
        {
          label: "Glossaries",
          href: `/org/${activeOrganizationSlug}/glossaries`,
          icon: BookOpenTextIcon,
        },
      ],
    },
    {
      label: "Manage",
      items: [
        {
          label: "Agent",
          href: `/org/${activeOrganizationSlug}/agent`,
          icon: BotIcon,
        },
        {
          label: "Integrations",
          href: `/org/${activeOrganizationSlug}/integrations`,
          icon: LinkSquare02Icon,
        },
        {
          label: "Settings",
          href: `/org/${activeOrganizationSlug}/settings`,
          icon: Settings01Icon,
        },
      ],
    },
  ] as const;

  return (
    <AppShellClient
      activeOrganization={auth.activeOrganization}
      organizations={auth.organizations}
      user={{
        email: auth.sessionUser.email,
        name: displayName,
        avatarUrl: auth.sessionUser.profilePictureUrl ?? undefined,
      }}
      navigation={<AppShellNavigation groups={navigationGroups} />}
    >
      {children}
    </AppShellClient>
  );
}
