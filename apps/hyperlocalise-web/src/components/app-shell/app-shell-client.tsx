"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { TeamSwitcher } from "@/components/team-switcher";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getAppShellTitle } from "./app-shell-title";
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
  showBillingLink?: boolean;
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
  showBillingLink = false,
  user,
}: AppShellClientProps) {
  const pathname = usePathname();
  const pageTitle = getAppShellTitle(pathname);

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
              className="size-7 shrink-0 rounded-full"
            />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <TypographyP className="truncate text-sm font-medium text-sidebar-foreground">
                Hyperlocalise
              </TypographyP>
            </div>
          </div>

          <div className="group-data-[collapsible=icon]:hidden">
            <TeamSwitcher
              activeOrganization={{
                name: activeOrganization.name,
                slug: activeOrganization.slug ?? "",
              }}
              organizations={organizations
                .filter((organization): organization is { name: string; slug: string } =>
                  Boolean(organization.slug),
                )
                .map((organization) => ({
                  name: organization.name,
                  slug: organization.slug,
                }))}
            />
          </div>

          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
            <InputGroup className="h-9 rounded-xl border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
              <InputGroupInput
                aria-label="Find"
                placeholder="Find…"
                className="text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/28"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText className="text-xs text-sidebar-foreground/50">F</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
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

        <SidebarSeparator className="bg-sidebar-border" />

        <SidebarFooter className="gap-3 px-3 py-3">
          <NavUser
            organizationName={activeOrganization.name}
            organizationSlug={activeOrganization.slug ?? ""}
            showBillingLink={showBillingLink}
            user={{ name: user.name, avatar: user.avatarUrl ?? "" }}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh bg-background">
        <div className="sticky top-0 z-20 border-b border-border bg-background/96 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <SidebarTrigger className="-ms-1" />
            <Separator
              orientation="vertical"
              className="me-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <TypographyP className="font-heading text-base font-medium text-foreground">
              {pageTitle}
            </TypographyP>
          </div>
        </div>

        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
