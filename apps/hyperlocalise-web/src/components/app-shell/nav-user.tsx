"use client";

import Link from "next/link";
import {
  AiUserIcon,
  CreditCardIcon,
  Logout01Icon,
  MoreVerticalCircle01Icon,
  Notification01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

export function NavUser({
  organizationName,
  organizationSlug,
  showBillingLink = false,
  user,
}: {
  organizationName: string;
  organizationSlug: string;
  showBillingLink?: boolean;
  user: {
    name: string;
    avatar: string;
  };
}) {
  const { isMobile, state } = useSidebar();
  const initials =
    user.name
      .split(" ")
      .slice(0, 2)
      .map((namePart) => namePart[0])
      .join("")
      .toUpperCase() || "HL";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                  <Avatar className="h-8 w-8 rounded-lg grayscale">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {organizationName}
                    </span>
                  </div>
                  <HugeiconsIcon
                    icon={MoreVerticalCircle01Icon}
                    strokeWidth={2}
                    className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
                  />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile}>
              {user.name}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {organizationName}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href={`/org/${organizationSlug}/settings/account`} />}
              >
                <HugeiconsIcon icon={AiUserIcon} strokeWidth={2} className="size-4" />
                Account
              </DropdownMenuItem>
              {showBillingLink ? (
                <DropdownMenuItem
                  render={<Link href={`/org/${organizationSlug}/settings/billing`} />}
                >
                  <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} className="size-4" />
                  Billing
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                render={<Link href={`/org/${organizationSlug}/settings/notifications`} />}
              >
                <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} className="size-4" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/auth/sign-out?returnTo=/" prefetch={false} />}>
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
