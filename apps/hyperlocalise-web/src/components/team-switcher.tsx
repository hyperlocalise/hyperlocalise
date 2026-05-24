"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle01Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";

type OrganizationOption = {
  name: string;
  slug: string;
};

type TeamSwitcherProps = {
  activeOrganization: OrganizationOption;
  organizations: OrganizationOption[];
};

export function buildOrganizationSwitchReturnTo(
  pathname: string,
  activeSlug: string,
  targetSlug: string,
) {
  if (pathname.startsWith(`/org/${activeSlug}`)) {
    return pathname.replace(`/org/${activeSlug}`, `/org/${targetSlug}`);
  }

  return `/org/${targetSlug}/dashboard`;
}

function buildOrganizationSwitchHref(targetSlug: string, pathname: string, activeSlug: string) {
  const returnTo = buildOrganizationSwitchReturnTo(pathname, activeSlug, targetSlug);
  return `/auth/select-organization/${targetSlug}?returnTo=${encodeURIComponent(returnTo)}`;
}

function organizationInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function TeamSwitcher({ activeOrganization, organizations }: TeamSwitcherProps) {
  const pathname = usePathname();
  const { isMobile } = useSidebar();
  const switchableOrganizations = organizations.filter((organization) => organization.slug);
  const canSwitch = switchableOrganizations.length > 1;

  if (!activeOrganization.slug) {
    return null;
  }

  const activeInitials = organizationInitials(activeOrganization.name);

  if (!canSwitch) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
              {activeInitials}
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{activeOrganization.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/45">Workspace</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
              {activeInitials}
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{activeOrganization.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/45">Switch workspace</span>
            </div>
            <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="ms-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {switchableOrganizations.map((organization) => {
                const isActive = organization.slug === activeOrganization.slug;
                const href = buildOrganizationSwitchHref(
                  organization.slug,
                  pathname,
                  activeOrganization.slug,
                );

                return (
                  <DropdownMenuItem
                    key={organization.slug}
                    className="gap-2 p-2"
                    nativeButton={false}
                    render={<Link href={href} />}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border text-[10px] font-medium">
                      {organizationInitials(organization.name)}
                    </div>
                    <span className="flex-1 truncate">{organization.name}</span>
                    {isActive ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle01Icon}
                        strokeWidth={1.8}
                        className="size-4 text-bud-400"
                      />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="gap-2 p-2 text-muted-foreground"
                nativeButton={false}
                render={<Link href="/auth/select-organization" />}
              >
                View all workspaces
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
