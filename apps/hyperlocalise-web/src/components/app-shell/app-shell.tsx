import type { ReactNode } from "react";

import { hasCapability } from "@/api/auth/policy";
import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { buildGlobalNavigationGroups } from "@/components/app-shell/navigation-config";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import {
  evaluateWorkspaceFeatureFlags,
  filterNavigationByWorkspaceFlags,
} from "@/lib/flags/workspace-flags";
import { getTmsProviderConnection } from "@/lib/providers/jobs/tms-provider-live";
import {
  getTmsUserConnectCtaState,
  type TmsUserConnectCta,
} from "@/lib/providers/credentials/tms-user-connection";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import type { IntlShape } from "react-intl";

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
  const intl = getIntlShape(await getAppLocale()) as IntlShape;

  const displayName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;
  const workspaceFeatureFlags = await evaluateWorkspaceFeatureFlags(auth);
  const navigationGroups = filterNavigationByWorkspaceFlags(
    buildGlobalNavigationGroups(activeOrganizationSlug, intl),
    workspaceFeatureFlags,
  );
  const tmsUserConnectCta: TmsUserConnectCta = hasCapability(auth.membership.role, "jobs:read")
    ? await getTmsUserConnectCtaState({
        organizationId: auth.activeOrganization.localOrganizationId,
        userId: auth.user.localUserId,
      })
    : { showConnectCta: false };
  let initialTmsProviderConnection: ActiveTmsProviderConnection | null = null;
  if (hasCapability(auth.membership.role, "provider_credentials:read")) {
    try {
      initialTmsProviderConnection = await getTmsProviderConnection(
        auth.activeOrganization.localOrganizationId,
      );
    } catch (error) {
      console.error("[app-shell] Failed to prefetch TMS provider connection", {
        organizationId: auth.activeOrganization.localOrganizationId,
        error,
      });
    }
  }

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
        email: auth.sessionUser.email,
        avatarUrl: auth.sessionUser.profilePictureUrl ?? undefined,
      }}
      navigationGroups={navigationGroups}
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
