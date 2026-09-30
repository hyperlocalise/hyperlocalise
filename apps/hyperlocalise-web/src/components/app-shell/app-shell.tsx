/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Suspense, type ReactNode } from "react";

import { hasCapability } from "@/api/auth/policy";
import { AppShellClient } from "@/components/app-shell/app-shell-client";
import { AppShellSkeleton } from "@/components/app-shell/app-shell-skeleton";
import { buildGlobalNavigationGroups } from "@/components/app-shell/navigation-config";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { annotateNavigationByWorkspaceFlags } from "@/lib/flags/workspace-flag-navigation";
import { evaluateWorkspaceFeatureFlags } from "@/lib/flags/workspace-flags";
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

export function AppShell({ autumnConfigured = false, children, organizationSlug }: AppShellProps) {
  return (
    <Suspense fallback={<AppShellSkeleton>{children}</AppShellSkeleton>}>
      <AppShellWithData autumnConfigured={autumnConfigured} organizationSlug={organizationSlug}>
        {children}
      </AppShellWithData>
    </Suspense>
  );
}

type AppShellWithDataProps = {
  autumnConfigured: boolean;
  children: ReactNode;
  organizationSlug: string;
};

async function AppShellWithData({
  autumnConfigured,
  children,
  organizationSlug,
}: AppShellWithDataProps) {
  const auth = await requireAppAuthContext({ organizationSlug });
  const activeOrganizationSlug = auth.activeOrganization.slug ?? organizationSlug;
  const intl = getIntlShape(await getAppLocale()) as IntlShape;

  const displayName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;
  const workspaceFeatureFlagsPromise = evaluateWorkspaceFeatureFlags(auth);
  const tmsUserConnectCtaPromise: Promise<TmsUserConnectCta> = hasCapability(
    auth.membership.role,
    "jobs:read",
  )
    ? getTmsUserConnectCtaState({
        organizationId: auth.activeOrganization.localOrganizationId,
        userId: auth.user.localUserId,
      })
    : Promise.resolve({ showConnectCta: false });
  const providerConnectionPromise = (async (): Promise<ActiveTmsProviderConnection | null> => {
    if (hasCapability(auth.membership.role, "provider_credentials:read")) {
      try {
        return await getTmsProviderConnection(auth.activeOrganization.localOrganizationId);
      } catch (error) {
        console.error("[app-shell] Failed to prefetch TMS provider connection", {
          organizationId: auth.activeOrganization.localOrganizationId,
          error,
        });
      }
    }
    return null;
  })();
  const [workspaceFeatureFlags, tmsUserConnectCta, initialTmsProviderConnection] =
    await Promise.all([
      workspaceFeatureFlagsPromise,
      tmsUserConnectCtaPromise,
      providerConnectionPromise,
    ]);
  const navigationGroups = annotateNavigationByWorkspaceFlags(
    buildGlobalNavigationGroups(activeOrganizationSlug, intl),
    workspaceFeatureFlags,
  );

  return (
    <AppShellClient
      activeOrganization={auth.activeOrganization}
      autumnConfigured={autumnConfigured}
      organizations={auth.organizations}
      tmsUserConnectCta={tmsUserConnectCta}
      showApiKeysLink={hasCapability(auth.membership.role, "api_keys:read")}
      showBillingLink={hasCapability(auth.membership.role, "billing:read")}
      showMembersLink={hasCapability(auth.membership.role, "workspace:read")}
      canWriteProjects={hasCapability(auth.membership.role, "projects:write")}
      user={{
        name: displayName,
        email: auth.sessionUser.email,
        avatarUrl: auth.sessionUser.profilePictureUrl ?? undefined,
      }}
      navigationGroups={navigationGroups}
      workspaceFeatureFlags={workspaceFeatureFlags}
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
