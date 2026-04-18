"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "Weekly ops", href: "/dashboard", icon: SparklesIcon },
  { label: "Translation run", href: "/dashboard#run", icon: ArrowRight01Icon },
  { label: "Model choice", href: "/dashboard#models", icon: CheckmarkCircle02Icon },
  { label: "TMS sync", href: "/dashboard#sync", icon: LinkSquare02Icon },
  { label: "Analytics", href: "/dashboard#analytics", icon: InformationCircleIcon },
] as const;

type AppShellProps = {
  children: ReactNode;
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  organizationName: string;
  organizationRole: string;
};

export function AppShell({ children, user, organizationName, organizationRole }: AppShellProps) {
  const pathname = usePathname();

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
          <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="size-7 rounded-full border border-white/15 bg-[linear-gradient(135deg,#2a2a2a,#101010)]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">Hyperlocalise</p>
                <p className="truncate text-xs text-white/42">{organizationName}</p>
              </div>
            </div>
            <Badge className="bg-[#0f0f0f] text-[0.68rem] text-white/72 ring-1 ring-white/10">
              {organizationRole}
            </Badge>
          </div>

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

        <SidebarContent className="gap-0 px-2 py-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {navigation.map((item) => {
                  const isActive = pathname === "/dashboard" && item.href === "/dashboard";

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.label}
                        className={cn(
                          "h-10 rounded-lg px-3 text-sm font-normal text-white/68 hover:text-white",
                          isActive && "bg-white/10 text-white",
                        )}
                      >
                        <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator className="bg-white/8" />

        <SidebarFooter className="gap-3 px-3 py-3">
          <div className="rounded-xl border border-white/8 bg-[#0a0a0a] px-3 py-3">
            <p className="text-xs font-medium tracking-[0.18em] text-white/38 uppercase">Role</p>
            <p className="mt-2 text-sm text-white/70">
              Signed in to {organizationName} as {organizationRole}.
            </p>
          </div>
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
          <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-white hover:bg-white/8 hover:text-white md:hidden" />
              <p className="font-heading text-base font-medium text-white">Dashboard</p>
            </div>
            <Badge
              variant="outline"
              className="rounded-full border-white/10 bg-transparent text-white/52"
            >
              {organizationName}
            </Badge>
          </div>
        </div>

        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
