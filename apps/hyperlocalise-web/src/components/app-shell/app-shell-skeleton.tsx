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
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { useIntl } from "react-intl";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";

import { appShellClientMessages } from "./app-shell-client.messages";

type AppShellSkeletonProps = {
  children: ReactNode;
};

export function AppShellSkeleton({ children }: AppShellSkeletonProps) {
  const intl = useIntl();

  return (
    <SidebarProvider
      defaultOpen
      style={
        {
          "--app-shell-content-height":
            "calc(100svh - var(--app-shell-header-height) - var(--app-shell-footer-height))",
          "--app-shell-plan-footer-height": "calc(3rem + env(safe-area-inset-bottom))",
          "--app-shell-footer-height":
            "calc(var(--app-shell-plan-footer-height) + var(--app-shell-dock-height, 0px))",
          "--sidebar-width": "15rem",
        } as CSSProperties
      }
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
              alt={intl.formatMessage(appShellClientMessages.logoAlt)}
              className="size-7 shrink-0 rounded-lg"
            />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <TypographyP
                className="text-sidebar-foreground"
                lineClamp={1}
                size="small"
                weight="medium"
              >
                {intl.formatMessage(appShellClientMessages.brandName)}
              </TypographyP>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-3 px-2 pt-2 pb-[var(--app-shell-footer-height)]">
          <div className="space-y-2 px-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="h-svh max-h-svh min-h-0 overflow-hidden bg-background pb-[var(--app-shell-footer-height)]">
        <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/96 backdrop-blur">
          <div className="flex h-(--app-shell-header-height) items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="-ms-1" />
              <Separator
                orientation="vertical"
                className="me-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
