import type { ReactNode } from "react";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Settings01Icon,
  SparklesIcon,
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
  const navigation = [
    {
      label: "Weekly ops",
      href: `/org/${activeOrganizationSlug}/dashboard`,
      icon: SparklesIcon,
    },
    {
      label: "Translation run",
      href: `/org/${activeOrganizationSlug}/dashboard#run`,
      icon: ArrowRight01Icon,
    },
    {
      label: "Model choice",
      href: `/org/${activeOrganizationSlug}/dashboard#models`,
      icon: CheckmarkCircle02Icon,
    },
    {
      label: "TMS sync",
      href: `/org/${activeOrganizationSlug}/dashboard#sync`,
      icon: LinkSquare02Icon,
    },
    {
      label: "Analytics",
      href: `/org/${activeOrganizationSlug}/dashboard#analytics`,
      icon: InformationCircleIcon,
    },
    {
      label: "Settings",
      href: `/org/${activeOrganizationSlug}/settings`,
      icon: Settings01Icon,
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
      navigation={<AppShellNavigation items={navigation} />}
    >
      {children}
    </AppShellClient>
  );
}
