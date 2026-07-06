"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";

import { PlanUsageSidebarWidget } from "@/components/billing/plan-usage-summary";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import ThemeToggle from "@/components/theme-toggle/theme-toggle";
import { AppShellBreadcrumb } from "./app-shell-breadcrumb";
import { AppShellNavigation } from "./app-shell-navigation";
import { TmsUserConnectButton } from "./tms-user-connect-button";
import { TmsUserOAuthErrorToast } from "./tms-user-oauth-error-toast";
import type { NavigationGroup } from "./navigation-config";
import { AppShellHeaderActions } from "./store/app-shell-header-actions";
import { AppShellStoreProvider } from "./store/app-shell-store-context";
import { SidebarStoreBridge } from "./store/sidebar-store-bridge";
import type { TmsUserConnectCta } from "@/lib/providers/credentials/tms-user-connection-shared";
import { useTmsUserConnectCta } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-tms-user-connect-cta";
import { NavUser } from "./nav-user";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";

type AppShellClientProps = {
  autumnConfigured?: boolean;
  children: ReactNode;
  navigationGroups: readonly NavigationGroup[];
  activeOrganization: {
    name: string;
    slug?: string | null;
  };
  organizations: Array<{
    name: string;
    slug?: string | null;
  }>;
  tmsUserConnectCta?: TmsUserConnectCta;
  showApiKeysLink?: boolean;
  showBillingLink?: boolean;
  showMembersLink?: boolean;
  user: {
    name: string;
    avatarUrl?: string;
  };
};

export function AppShellClient({
  autumnConfigured = false,
  children,
  navigationGroups,
  activeOrganization,
  organizations,
  tmsUserConnectCta = { showConnectCta: false },
  showApiKeysLink = false,
  showBillingLink = false,
  showMembersLink = false,
  user,
}: AppShellClientProps) {
  const organizationSlug = activeOrganization.slug ?? "";
  const tmsUserConnectQuery = useTmsUserConnectCta(organizationSlug, {
    enabled: Boolean(organizationSlug),
    initialData: tmsUserConnectCta,
  });
  const resolvedTmsUserConnectCta = tmsUserConnectQuery.data ?? tmsUserConnectCta;

  return (
    <AppShellStoreProvider defaultNavigationGroups={navigationGroups}>
      <TmsUserOAuthErrorToast />
      <SidebarProvider
        defaultOpen
        style={{ "--sidebar-width": "15rem" } as CSSProperties}
        className="min-h-svh bg-background text-foreground"
      >
        <SidebarStoreBridge />
        <Sidebar variant="sidebar" collapsible="icon">
          <SidebarHeader className="gap-3 border-b border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <div className="flex items-center gap-2.5 rounded-xl px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <Image
                src="/images/logo.png"
                width={28}
                height={28}
                sizes="28px"
                alt="Hyperlocalise logo"
                className="size-7 shrink-0 rounded-lg"
              />
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <TypographyP className="truncate text-sm font-medium text-sidebar-foreground">
                  Hyperlocalise
                </TypographyP>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2 py-2">
            <AppShellNavigation organizationSlug={organizationSlug} />

            {showBillingLink && autumnConfigured ? (
              <PlanUsageSidebarWidget organizationSlug={organizationSlug} />
            ) : null}
          </SidebarContent>

          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-h-svh bg-background">
          <div className="sticky top-0 z-20 border-b border-border bg-background/96 backdrop-blur">
            <div className="flex h-[var(--app-shell-header-height)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="-ms-1" />
                <Separator
                  orientation="vertical"
                  className="me-2 data-vertical:h-4 data-vertical:self-auto"
                />
                <AppShellBreadcrumb organizationSlug={organizationSlug} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AppShellHeaderActions />
                {resolvedTmsUserConnectCta.showConnectCta && organizationSlug ? (
                  <TmsUserConnectButton
                    organizationSlug={organizationSlug}
                    providerKind={resolvedTmsUserConnectCta.providerKind}
                    providerDisplayName={resolvedTmsUserConnectCta.providerDisplayName}
                    connectMethod={resolvedTmsUserConnectCta.connectMethod}
                  />
                ) : null}
                <ThemeToggle />
                <NavUser
                  organizationName={activeOrganization.name}
                  organizationSlug={activeOrganization.slug ?? ""}
                  organizations={organizations}
                  showApiKeysLink={showApiKeysLink}
                  showBillingLink={showBillingLink}
                  showMembersLink={showMembersLink}
                  user={{ name: user.name, avatar: user.avatarUrl ?? "" }}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AppShellStoreProvider>
  );
}
