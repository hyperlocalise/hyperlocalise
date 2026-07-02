import type { ReactNode } from "react";

import { hasCapability } from "@/api/auth/policy";
import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { AppShellNavigation } from "@/components/app-shell/app-shell-navigation";
import { buildGlobalNavigationGroups } from "@/components/app-shell/navigation-config";
import {
  evaluateWorkspaceFeatureFlags,
  filterNavigationByWorkspaceFlags,
} from "@/lib/flags/workspace-flags";
import { getTmsProviderConnection } from "@/lib/providers/tms-provider-live";
import {
  getTmsUserConnectCtaState,
  type TmsUserConnectCta,
} from "@/lib/providers/tms-user-connection";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { OrgTmsQueryProvider } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/org-tms-query-provider";
import type { ActiveTmsProviderConnection } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-active-tms-provider";

export type AppShellProps = {
  autumnConfigured?: boolean;
  children: ReactNode;
  organizationSlug: string;
};

export async function AppShell({
  autumnConfigured = false,
  children,
  organizationSlug,
}: AppShellProps) {
  const auth = await requireAppAuthContext({ organizationSlug });
  const activeOrganizationSlug = auth.activeOrganization.slug ?? organizationSlug;

  const displayName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;
  const workspaceFeatureFlags = await evaluateWorkspaceFeatureFlags(auth);
  const navigationGroups = filterNavigationByWorkspaceFlags(
    buildGlobalNavigationGroups(activeOrganizationSlug),
    workspaceFeatureFlags,
  );
  const tmsUserConnectCta: TmsUserConnectCta = hasCapability(auth.membership.role, "jobs:read")
    ? await getTmsUserConnectCtaState({
        organizationId: auth.activeOrganization.localOrganizationId,
        userId: auth.user.localUserId,
      })
    : { showConnectCta: false };
  const initialTmsProviderConnection: ActiveTmsProviderConnection | null = hasCapability(
    auth.membership.role,
    "provider_credentials:read",
  )
    ? await getTmsProviderConnection(auth.activeOrganization.localOrganizationId)
    : null;

  return (
    <AppShellClient
      activeOrganization={auth.activeOrganization}
      autumnConfigured={autumnConfigured}
      organizations={auth.organizations}
      tmsUserConnectCta={tmsUserConnectCta}
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
      <OrgTmsQueryProvider
        organizationSlug={activeOrganizationSlug}
        initialTmsProviderConnection={initialTmsProviderConnection}
      >
        {children}
      </OrgTmsQueryProvider>
    </AppShellClient>
  );
}
