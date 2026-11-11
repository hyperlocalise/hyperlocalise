"use client";

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
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BuildingsIcon,
  CaretUpDownIcon,
  CheckIcon,
  GearIcon,
  PlusIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildOrganizationSwitchHref } from "@/components/team-switcher";
import { cn } from "@/lib/primitives/cn";

import { buildOrganizationPath } from "./navigation-config";
import { organizationSwitcherMessages } from "./organization-switcher.messages";

type OrganizationOption = {
  name: string;
  slug?: string | null;
};

export function OrganizationSwitcher({
  activeOrganization,
  organizations,
  showMembersLink = false,
  canInviteMembers = false,
}: {
  activeOrganization: OrganizationOption;
  organizations: OrganizationOption[];
  showMembersLink?: boolean;
  canInviteMembers?: boolean;
}) {
  const intl = useIntl();
  const pathname = usePathname();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const activeSlug = activeOrganization.slug ?? "";
  const switchableOrganizations = organizations.filter(
    (organization): organization is { name: string; slug: string } => Boolean(organization.slug),
  );
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  data-slot="organization-switcher-trigger"
                  className="flex h-10 w-full items-center gap-2 rounded-lg px-1.5 text-start text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent focus-visible:ring-2 data-popup-open:bg-sidebar-accent group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                  aria-label={intl.formatMessage(organizationSwitcherMessages.openMenu, {
                    name: activeOrganization.name,
                  })}
                >
                  <OrganizationAvatar name={activeOrganization.name} />
                  <span className="min-w-0 flex-1 truncate font-semibold group-data-[collapsible=icon]:hidden">
                    {activeOrganization.name}
                  </span>
                  <CaretUpDownIcon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
                  />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile}>
              {activeOrganization.name}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            className="min-w-60 rounded-lg"
            side={isMobile || state === "expanded" ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                <FormattedMessage {...organizationSwitcherMessages.switchWorkspace} />
              </DropdownMenuLabel>
              {switchableOrganizations.map((organization) => {
                const isActive = organization.slug === activeSlug;

                return (
                  <DropdownMenuItem
                    key={organization.slug}
                    className="gap-2 p-2"
                    onClick={closeMobileSidebar}
                    render={
                      <Link
                        href={buildOrganizationSwitchHref(organization.slug, pathname, activeSlug)}
                        aria-current={isActive ? "true" : undefined}
                      />
                    }
                  >
                    <OrganizationAvatar name={organization.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                    {isActive ? (
                      <CheckIcon
                        className="size-4 text-foreground"
                        aria-label={intl.formatMessage(
                          organizationSwitcherMessages.currentWorkspace,
                        )}
                      />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            {activeSlug ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={closeMobileSidebar}
                    render={<Link href={buildOrganizationPath(activeSlug, "settings")} />}
                  >
                    <GearIcon className="size-4" />
                    <FormattedMessage {...organizationSwitcherMessages.workspaceSettings} />
                  </DropdownMenuItem>
                  {showMembersLink || canInviteMembers ? (
                    <DropdownMenuItem
                      onClick={closeMobileSidebar}
                      render={<Link href={buildOrganizationPath(activeSlug, "members")} />}
                    >
                      {canInviteMembers ? (
                        <>
                          <UserPlusIcon className="size-4" />
                          <FormattedMessage {...organizationSwitcherMessages.inviteMembers} />
                        </>
                      ) : (
                        <>
                          <UsersThreeIcon className="size-4" />
                          <FormattedMessage {...organizationSwitcherMessages.members} />
                        </>
                      )}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={closeMobileSidebar}
              render={
                <Link
                  href={
                    activeSlug
                      ? `/auth/new-workspace?from=${encodeURIComponent(activeSlug)}`
                      : "/auth/new-workspace"
                  }
                />
              }
            >
              <PlusIcon className="size-4" />
              <FormattedMessage {...organizationSwitcherMessages.createWorkspace} />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={closeMobileSidebar}
              render={<Link href="/auth/select-organization" />}
            >
              <BuildingsIcon className="size-4" />
              <FormattedMessage {...organizationSwitcherMessages.viewAllWorkspaces} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function OrganizationAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground",
        size === "md" ? "size-7 text-sm" : "size-5 text-[0.6875rem]",
      )}
    >
      {initial}
    </span>
  );
}
