"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
import { TmsUserConnectButton } from "./tms-user-connect-button";
import type { TmsUserConnectCta } from "@/lib/providers/tms-user-connection-shared";
import { useTmsUserConnectCta } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-tms-user-connect-cta";
import { NavUser } from "./nav-user";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";

type AppShellClientProps = {
  children: ReactNode;
  navigation: ReactNode;
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
  children,
  navigation,
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
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
      className="min-h-svh bg-background text-foreground"
    >
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
          {navigation}

          {showBillingLink ? (
            <div className="mt-auto px-1 pb-2 group-data-[collapsible=icon]:hidden">
              <div className="rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-3">
                <TypographyP className="text-xs font-medium text-sidebar-foreground">
                  Plan usage
                </TypographyP>
                <TypographyP className="mt-3 text-xs text-sidebar-foreground/80">
                  Enterprise
                </TypographyP>
                <TypographyP className="mt-1 text-xs text-sidebar-foreground/70">
                  Renews on Aug 24, 2027
                </TypographyP>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sidebar-foreground/10">
                  <div className="h-full w-[60%] rounded-full bg-bud-500" />
                </div>
                <TypographyP className="mt-3 text-xs text-sidebar-foreground/68">
                  1.2M / 2M words used
                </TypographyP>
                <div className="mt-3 flex items-center gap-2 text-xs text-sidebar-foreground/58">
                  <span>View usage</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-3.5" />
                </div>
              </div>
            </div>
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
              {resolvedTmsUserConnectCta.showConnectCta && organizationSlug ? (
                <TmsUserConnectButton
                  organizationSlug={organizationSlug}
                  providerKind={resolvedTmsUserConnectCta.providerKind}
                  providerDisplayName={resolvedTmsUserConnectCta.providerDisplayName}
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
  );
}
