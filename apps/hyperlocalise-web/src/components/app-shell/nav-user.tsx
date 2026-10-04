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
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserCircleIcon,
  BuildingsIcon,
  CheckCircleIcon,
  CreditCardIcon,
  GlobeIcon,
  KeyIcon,
  SignOutIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
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
import { LocaleDialog } from "@/components/locale-toggle/locale-dialog";
import { localeDialogMessages } from "@/components/locale-toggle/locale-dialog.messages";
import ThemeToggle from "@/components/theme-toggle/theme-toggle";
import { buildOrganizationSwitchHref } from "@/components/team-switcher";
import {
  getAppLocaleFlagEmoji,
  getNativeLocaleDisplayName,
} from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { buildPlanUsageHref } from "@/lib/billing/plan-usage";

import { navUserMessages } from "./nav-user.messages";

type OrganizationOption = {
  name: string;
  slug?: string | null;
};

export function NavUser({
  organizationSlug,
  organizations,
  showApiKeysLink = false,
  showBillingLink = false,
  showMembersLink = false,
  user,
}: {
  organizationSlug: string;
  organizations: OrganizationOption[];
  showApiKeysLink?: boolean;
  showBillingLink?: boolean;
  showMembersLink?: boolean;
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const pathname = usePathname();
  const activeLocale = useAppLocale();
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
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
    <>
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
        <DropdownMenuContent
          className="min-w-64 rounded-lg"
          side="bottom"
          align="end"
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-full">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <ThemeToggle variant="segmented" />
          <DropdownMenuItem onClick={() => setLanguageDialogOpen(true)}>
            <GlobeIcon className="size-4" />
            <span className="flex-1">
              <FormattedMessage {...localeDialogMessages.menuItem} />
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true">{getAppLocaleFlagEmoji(activeLocale)}</span>
              <span className="truncate" lang={activeLocale}>
                {getNativeLocaleDisplayName(activeLocale)}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href={`/org/${organizationSlug}/settings/account`} />}>
              <UserCircleIcon className="size-4" />
              <FormattedMessage {...navUserMessages.account} />
            </DropdownMenuItem>
            {showMembersLink ? (
              <DropdownMenuItem render={<Link href={`/org/${organizationSlug}/members`} />}>
                <UsersThreeIcon className="size-4" />
                <FormattedMessage {...navUserMessages.members} />
              </DropdownMenuItem>
            ) : null}
            {showApiKeysLink ? (
              <DropdownMenuItem
                render={<Link href={`/org/${organizationSlug}/settings/api-keys`} />}
              >
                <KeyIcon className="size-4" />
                <FormattedMessage {...navUserMessages.apiKeys} />
              </DropdownMenuItem>
            ) : null}
            {showBillingLink ? (
              <DropdownMenuItem render={<Link href={buildPlanUsageHref(organizationSlug)} />}>
                <CreditCardIcon className="size-4" />
                <FormattedMessage {...navUserMessages.billing} />
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {canSwitchWorkspace ? (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <BuildingsIcon className="size-4" />
                  <FormattedMessage {...navUserMessages.switchWorkspace} />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-56">
                  <DropdownMenuGroup>
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
                          {isActive ? <CheckCircleIcon className="size-4 text-bud-400" /> : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
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
            <SignOutIcon className="size-4" />
            <FormattedMessage {...navUserMessages.logOut} />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LocaleDialog open={languageDialogOpen} onOpenChange={setLanguageDialogOpen} />
    </>
  );
}
