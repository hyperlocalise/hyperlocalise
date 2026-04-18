"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarInput,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
      className="min-h-svh bg-[#050505] text-white"
    >
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className={cn(
          "[--sidebar:#050505]",
          "[--sidebar-foreground:oklch(0.93_0_0)]",
          "[--sidebar-border:oklch(0.28_0_0)]",
          "[--sidebar-accent:oklch(0.16_0_0)]",
          "[--sidebar-accent-foreground:oklch(0.97_0_0)]",
          "[--sidebar-ring:oklch(0.55_0_0)]",
        )}
      >
        <SidebarHeader className="gap-3 border-b border-white/8 px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
            <div className="size-7 rounded-full border border-white/15 bg-[linear-gradient(135deg,#2a2a2a,#101010)]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">Hyperlocalise</p>
              <p className="truncate text-xs text-white/45">{activeOrganization.name}</p>
            </div>
          </div>

          {organizations.length > 1 ? (
            <div className="flex flex-wrap gap-1">
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
                    className="h-8 rounded-lg border border-white/8 px-2 text-xs text-white/58 hover:bg-white/8 hover:text-white"
                    render={<Link href={`/auth/select-organization/${organization.slug}`} />}
                  >
                    {organization.name}
                  </Button>
                ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <SidebarInput
              aria-label="Find"
              placeholder="Find…"
              className="h-9 rounded-xl border-white/10 bg-white/4 text-sm text-white placeholder:text-white/28"
            />
            <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/4 text-xs text-white/50">
              F
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0 px-2 py-2">{navigation}</SidebarContent>

        <SidebarSeparator className="bg-white/8" />

        <SidebarFooter className="gap-3 px-3 py-3">
          <div className="flex items-center gap-3 rounded-xl px-1 py-1">
            <div className="size-7 overflow-hidden rounded-full bg-[linear-gradient(135deg,#585858,#1c1c1c)]">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{user.name}</p>
              <p className="truncate text-xs text-white/45">{user.email}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            className="justify-start px-1 text-white/65 hover:bg-white/8 hover:text-white"
            render={<Link href="/auth/sign-out?returnTo=/" />}
          >
            Sign out
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh bg-[#050505]">
        <div className="sticky top-0 z-20 border-b border-white/8 bg-[#050505]/96 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <SidebarTrigger className="text-white hover:bg-white/8 hover:text-white md:hidden" />
            <p className="font-heading text-base font-medium text-white">Dashboard</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
