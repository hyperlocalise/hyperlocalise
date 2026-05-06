"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
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
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
};

export function AppShellClient({
  children,
  navigation,
  activeOrganization,
  organizations,
  user,
}: AppShellClientProps) {
  const pathname = usePathname();
  const pageTitle = getAppShellTitle(pathname);

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
      className="min-h-svh bg-app-shell-background text-app-shell-foreground"
    >
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className={cn(
          "[--sidebar:var(--app-shell-background)]",
          "[--sidebar-foreground:var(--app-shell-foreground)]",
          "[--sidebar-border:oklch(0.28_0_0)]",
          "[--sidebar-accent:oklch(0.16_0_0)]",
          "[--sidebar-accent-foreground:oklch(0.97_0_0)]",
          "[--sidebar-ring:oklch(0.55_0_0)]",
        )}
      >
        <SidebarHeader className="gap-3 border-b border-app-shell-foreground/8 px-3 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
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
              <TypographyP className="truncate text-sm font-medium text-app-shell-foreground">
                Hyperlocalise
              </TypographyP>
              <TypographyP className="truncate text-xs text-app-shell-foreground/45">
                {activeOrganization.name}
              </TypographyP>
            </div>
          </div>

          {organizations.length > 1 ? (
            <div className="flex flex-wrap gap-1 group-data-[collapsible=icon]:hidden">
              {organizations
                .filter(
                  (organization) =>
                    organization.slug && organization.slug !== activeOrganization.slug,
                )
                .map((organization) => (
                  <Button
                    key={organization.slug}
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    className="h-8 rounded-lg border border-app-shell-foreground/8 px-2 text-xs text-app-shell-foreground/58 hover:bg-app-shell-foreground/8 hover:text-app-shell-foreground"
                    render={<Link href={`/auth/select-organization/${organization.slug}`} />}
                  >
                    {organization.name}
                  </Button>
                ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
            <InputGroup className="h-9 rounded-xl border-app-shell-foreground/10 bg-app-shell-foreground/4 text-app-shell-foreground">
              <InputGroupInput
                aria-label="Find"
                placeholder="Find…"
                className="text-sm text-app-shell-foreground placeholder:text-app-shell-foreground/28"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText className="text-xs text-app-shell-foreground/50">F</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0 px-2 py-2">
          {navigation}

          <div className="mt-auto px-1 pb-2 group-data-[collapsible=icon]:hidden">
            <div className="rounded-lg border border-app-shell-foreground/8 bg-app-shell-foreground/3 px-3 py-3">
              <TypographyP className="text-xs font-medium text-app-shell-foreground/84">
                Plan usage
              </TypographyP>
              <TypographyP className="mt-3 text-xs text-app-shell-foreground/46">
                Enterprise
              </TypographyP>
              <TypographyP className="mt-1 text-xs text-app-shell-foreground/38">
                Renews on Aug 24, 2025
              </TypographyP>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-app-shell-foreground/10">
                <div className="h-full w-[60%] rounded-full bg-bud-500" />
              </div>
              <TypographyP className="mt-3 text-xs text-app-shell-foreground/68">
                1.2M / 2M words used
              </TypographyP>
              <div className="mt-3 flex items-center gap-2 text-xs text-app-shell-foreground/58">
                <span>View usage</span>
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-3.5" />
              </div>
            </div>
          </div>
        </SidebarContent>

        <SidebarSeparator className="bg-app-shell-foreground/8" />

        <SidebarFooter className="gap-3 px-3 py-3">
          <NavUser
            organizationSlug={activeOrganization.slug ?? ""}
            user={{ name: user.name, email: user.email, avatar: user.avatarUrl ?? "" }}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh bg-app-shell-background">
        <div className="sticky top-0 z-20 border-b border-app-shell-foreground/8 bg-app-shell-background/96 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <SidebarTrigger className="-ms-1" />
            <Separator
              orientation="vertical"
              className="me-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <TypographyP className="font-heading text-base font-medium text-app-shell-foreground">
              {pageTitle}
            </TypographyP>
          </div>
        </div>

        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
