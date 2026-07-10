"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AiUserIcon,
  Building02Icon,
  CheckmarkCircle01Icon,
  CreditCardIcon,
  Key01Icon,
  Logout01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildOrganizationSwitchHref } from "@/components/team-switcher";
import { buildPlanUsageHref } from "@/lib/billing/plan-usage";

import { navUserMessages } from "./nav-user.messages";

type OrganizationOption = {
  name: string;
  slug?: string | null;
};

export function NavUser({
  organizationName,
  organizationSlug,
  organizations,
  showApiKeysLink = false,
  showBillingLink = false,
  showMembersLink = false,
  user,
}: {
  organizationName: string;
  organizationSlug: string;
  organizations: OrganizationOption[];
  showApiKeysLink?: boolean;
  showBillingLink?: boolean;
  showMembersLink?: boolean;
  user: {
    name: string;
    avatar: string;
  };
}) {
  const pathname = usePathname();
  const switchableOrganizations = organizations.filter(
    (organization): organization is { name: string; slug: string } => Boolean(organization.slug),
  );
  const canSwitchWorkspace = organizationSlug && switchableOrganizations.length > 1;
  const initials =
    user.name
      .split(" ")
      .slice(0, 2)
      .map((namePart) => namePart[0])
      .join("")
      .toUpperCase() || "HL";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full p-0 data-open:bg-accent"
                >
                  <Avatar className="size-7 rounded-full">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-full text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="sr-only">
                    <FormattedMessage
                      {...navUserMessages.openAccountMenu}
                      values={{ name: user.name }}
                    />
                  </span>
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" align="center">
          <FormattedMessage {...navUserMessages.accountTooltip} />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="min-w-56 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{organizationName}</span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href={`/org/${organizationSlug}/settings/account`} />}>
            <HugeiconsIcon icon={AiUserIcon} strokeWidth={2} className="size-4" />
            <FormattedMessage {...navUserMessages.account} />
          </DropdownMenuItem>
          {showMembersLink ? (
            <DropdownMenuItem render={<Link href={`/org/${organizationSlug}/members`} />}>
              <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-4" />
              <FormattedMessage {...navUserMessages.members} />
            </DropdownMenuItem>
          ) : null}
          {showApiKeysLink ? (
            <DropdownMenuItem render={<Link href={`/org/${organizationSlug}/settings/api-keys`} />}>
              <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-4" />
              <FormattedMessage {...navUserMessages.apiKeys} />
            </DropdownMenuItem>
          ) : null}
          {showBillingLink ? (
            <DropdownMenuItem render={<Link href={buildPlanUsageHref(organizationSlug)} />}>
              <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} className="size-4" />
              <FormattedMessage {...navUserMessages.billing} />
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {canSwitchWorkspace ? (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={Building02Icon} strokeWidth={2} className="size-4" />
                <FormattedMessage {...navUserMessages.switchWorkspace} />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  <FormattedMessage {...navUserMessages.workspaces} />
                </DropdownMenuLabel>
                {switchableOrganizations.map((organization) => {
                  const isActive = organization.slug === organizationSlug;

                  return (
                    <DropdownMenuItem
                      key={organization.slug}
                      className="gap-2 p-2"
                      render={
                        <Link
                          href={buildOrganizationSwitchHref(
                            organization.slug,
                            pathname,
                            organizationSlug,
                          )}
                        />
                      }
                    >
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
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/auth/select-organization" />}>
                  <FormattedMessage {...navUserMessages.viewAllWorkspaces} />
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem render={<Link href="/auth/sign-out?returnTo=/" prefetch={false} />}>
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-4" />
          <FormattedMessage {...navUserMessages.logOut} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
