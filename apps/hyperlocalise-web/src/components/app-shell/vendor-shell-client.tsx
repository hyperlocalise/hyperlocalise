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
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  BuildingsIcon,
  GlobeIcon,
  ListChecksIcon,
  SignOutIcon,
  UserMinusIcon,
} from "@phosphor-icons/react";

import { isVendorPagePath, vendorHomePath } from "@/api/auth/vendor-access";
import { LeaveWorkspaceDialog } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/leave-workspace-dialog";
import { LocaleDialog } from "@/components/locale-toggle/locale-dialog";
import { localeDialogMessages } from "@/components/locale-toggle/locale-dialog.messages";
import ThemeToggle from "@/components/theme-toggle/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { navUserMessages } from "./nav-user.messages";
import type { NavigationGroup } from "./navigation-config";
import { AppShellHeaderActions } from "./store/app-shell-header-actions";
import { AppShellSessionProvider } from "./store/app-shell-session-context";
import { AppShellStoreProvider } from "./store/app-shell-store-context";
import { SidebarStoreBridge } from "./store/sidebar-store-bridge";
import { vendorShellMessages } from "./vendor-shell.messages";

type VendorShellClientProps = {
  children: ReactNode;
  activeOrganization: { name: string; slug: string };
  /** Whether this is the only workspace the person belongs to. */
  isOnlyWorkspace: boolean;
  user: { id: string; name: string; email: string; avatarUrl?: string };
};

/**
 * The page frame for a vendor: My jobs, their account menu, and nothing else. It is separate
 * from `AppShellClient` because that one loads the inbox, QA reports, the assistant, project
 * navigation and billing, none of which a vendor may reach (`vendor-access.ts`).
 */
export function VendorShellClient({
  children,
  activeOrganization,
  isOnlyWorkspace,
  user,
}: VendorShellClientProps) {
  const intl = useIntl();
  const pathname = usePathname();
  const router = useRouter();
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const homePath = vendorHomePath(activeOrganization.slug);
  const navigationGroups = useMemo<readonly NavigationGroup[]>(
    () => [
      {
        items: [
          {
            label: intl.formatMessage(vendorShellMessages.myJobs),
            href: homePath,
            icon: ListChecksIcon,
            tone: "indigo",
          },
        ],
      },
    ],
    [homePath, intl],
  );
  const currentUser = useMemo(
    () => ({ avatarUrl: user.avatarUrl ?? null, email: user.email, name: user.name }),
    [user.avatarUrl, user.email, user.name],
  );
  const initials =
    user.name
      .split(" ")
      .slice(0, 2)
      .map((namePart) => namePart[0])
      .join("")
      .toUpperCase() || "HL";

  // Pages refuse a vendor on the server when they load their data. This sends a vendor back
  // from the few pages that load nothing on the server; their requests are refused anyway.
  const isAllowedPage = isVendorPagePath(pathname);
  useEffect(() => {
    if (!isAllowedPage) {
      router.replace(homePath);
    }
  }, [homePath, isAllowedPage, router]);

  return (
    <AppShellSessionProvider
      canDeleteQueries={false}
      currentUser={currentUser}
      isVendor
      vendorUserId={user.id}
    >
      <AppShellStoreProvider defaultNavigationGroups={navigationGroups}>
        <SidebarProvider
          defaultOpen
          style={
            {
              "--app-shell-content-height": "calc(100svh - var(--app-shell-header-height))",
              "--app-shell-plan-footer-height": "0px",
              "--app-shell-footer-height": "0px",
              "--sidebar-width": "15rem",
            } as CSSProperties
          }
          className="min-h-svh bg-background text-foreground"
        >
          <SidebarStoreBridge />
          <Sidebar variant="sidebar" collapsible="icon">
            <SidebarHeader className="h-(--app-shell-header-height) shrink-0 justify-center border-b border-sidebar-border px-3 py-0 group-data-[collapsible=icon]:items-center">
              <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
                {activeOrganization.name}
              </span>
            </SidebarHeader>
            <SidebarContent className="gap-0 px-2 pt-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.replace(/\/$/, "").endsWith("/my-jobs")}
                    tooltip={intl.formatMessage(vendorShellMessages.myJobs)}
                    render={<Link href={homePath} />}
                  >
                    <ListChecksIcon className="size-4" />
                    <span>
                      <FormattedMessage {...vendorShellMessages.myJobs} />
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
            <SidebarRail />
          </Sidebar>

          <SidebarInset className="h-svh max-h-svh min-h-0 overflow-hidden bg-background">
            <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/96 backdrop-blur">
              <div className="flex h-(--app-shell-header-height) items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                  <SidebarTrigger className="-ms-1" />
                  <Separator
                    orientation="vertical"
                    className="me-2 data-vertical:h-4 data-vertical:self-auto"
                  />
                  <Link href={homePath} className="truncate text-sm font-medium">
                    <FormattedMessage {...vendorShellMessages.myJobs} />
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AppShellHeaderActions />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-full p-0 data-open:bg-accent"
                        >
                          <Avatar className="size-7 rounded-full">
                            <AvatarImage src={user.avatarUrl ?? ""} alt={user.name} />
                            <AvatarFallback className="rounded-full text-xs">
                              {initials}
                            </AvatarFallback>
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
                    <DropdownMenuContent
                      className="min-w-64 rounded-lg"
                      side="bottom"
                      align="end"
                      sideOffset={4}
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="p-0 font-normal">
                          <div className="grid min-w-0 px-2 py-1.5 text-left text-sm leading-tight">
                            <span className="truncate font-medium">{user.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </DropdownMenuLabel>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <ThemeToggle variant="segmented" />
                      <DropdownMenuItem onClick={() => setLanguageDialogOpen(true)}>
                        <GlobeIcon className="size-4" />
                        <FormattedMessage {...localeDialogMessages.menuItem} />
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem render={<Link href="/auth/select-organization" />}>
                        <BuildingsIcon className="size-4" />
                        <FormattedMessage {...vendorShellMessages.allWorkspaces} />
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLeaveOpen(true)}>
                        <UserMinusIcon className="size-4" />
                        <FormattedMessage {...vendorShellMessages.leaveWorkspace} />
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        render={<Link href="/auth/sign-out?returnTo=/" prefetch={false} />}
                      >
                        <SignOutIcon className="size-4" />
                        <FormattedMessage {...navUserMessages.logOut} />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
              {isAllowedPage ? children : null}
            </div>
          </SidebarInset>
        </SidebarProvider>
        <LocaleDialog open={languageDialogOpen} onOpenChange={setLanguageDialogOpen} />
        <LeaveWorkspaceDialog
          open={leaveOpen}
          organizationSlug={activeOrganization.slug}
          organizationName={activeOrganization.name}
          isOnlyWorkspace={isOnlyWorkspace}
          onClose={() => setLeaveOpen(false)}
        />
      </AppShellStoreProvider>
    </AppShellSessionProvider>
  );
}
