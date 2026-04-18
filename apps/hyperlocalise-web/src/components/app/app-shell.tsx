import type { ReactNode } from "react";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { AppShellClient } from "@/components/app/app-shell-client";
import { AppShellNavigation } from "@/components/app/app-shell-navigation";

export type AppShellProps = {
  children: ReactNode;
  organizationSlug: string;
};

export async function AppShell({ children, organizationSlug }: AppShellProps) {
  const { user } = await withAuth({ ensureSignedIn: true });
  const auth = await requireAppAuthContext({ organizationSlug });
  const activeOrganizationSlug = auth.activeOrganization.slug ?? organizationSlug;

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
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
  ] as const;

  return (
    <AppShellClient
      activeOrganization={auth.activeOrganization}
      organizations={auth.organizations}
      user={{
        email: user.email,
        name: displayName,
        avatarUrl: user.profilePictureUrl ?? undefined,
      }}
      navigation={<AppShellNavigation items={navigation} />}
    >
      {children}
    </AppShellClient>
  );
}
