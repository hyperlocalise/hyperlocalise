import type { ReactNode } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { AppShellNavigation } from "@/components/app-shell/app-shell-navigation";
import { buildGlobalNavigationGroups } from "@/components/app-shell/navigation-config";
import { getCrowdinConnectCtaState } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";

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
  const navigationGroups = buildGlobalNavigationGroups(activeOrganizationSlug);
  const { showCrowdinConnectCta } = hasCapability(auth.membership.role, "jobs:read")
    ? await getCrowdinConnectCtaState({
        organizationId: auth.activeOrganization.localOrganizationId,
        userId: auth.user.localUserId,
      })
    : { showCrowdinConnectCta: false };

  return (
    <AppShellClient
      activeOrganization={auth.activeOrganization}
      organizations={auth.organizations}
      showCrowdinConnectCta={showCrowdinConnectCta}
      showApiKeysLink={hasCapability(auth.membership.role, "api_keys:read")}
      showBillingLink={hasCapability(auth.membership.role, "billing:read")}
      showMembersLink={hasCapability(auth.membership.role, "workspace:read")}
      user={{
        name: displayName,
        avatarUrl: auth.sessionUser.profilePictureUrl ?? undefined,
      }}
      navigation={
        <AppShellNavigation organizationSlug={activeOrganizationSlug} groups={navigationGroups} />
      }
    >
      {children}
    </AppShellClient>
  );
}
