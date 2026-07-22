"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  CustomerSupportIcon,
  DashboardSquare01Icon,
  RefreshIcon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/primitives/cn";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

type ErrorRecoveryProps = {
  title: string;
  description: string;
  tryAgainLabel: string;
  dashboardLabel: string;
  supportLabel: string;
  dashboardHref: string;
  retry: () => void;
  fullPage?: boolean;
};

export function ErrorRecovery({
  title,
  description,
  tryAgainLabel,
  dashboardLabel,
  supportLabel,
  dashboardHref,
  retry,
  fullPage = false,
}: ErrorRecoveryProps) {
  return (
    <main
      className={cn(
        "flex w-full items-center justify-center bg-background px-4 py-12 text-foreground",
        fullPage ? "min-h-dvh" : "min-h-[60vh]",
      )}
    >
      <Empty className="max-w-xl border border-border bg-card px-6 py-12 shadow-sm sm:px-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle className="font-heading text-2xl font-semibold text-balance">
            {title}
          </EmptyTitle>
          <EmptyDescription className="max-w-md text-pretty">{description}</EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="max-w-md gap-3 sm:flex-row sm:justify-center">
          <Button className="w-full sm:w-auto" onClick={retry}>
            <HugeiconsIcon data-icon="inline-start" icon={RefreshIcon} strokeWidth={2} />
            {tryAgainLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            nativeButton={false}
            render={<Link href={dashboardHref} />}
          >
            <HugeiconsIcon data-icon="inline-start" icon={DashboardSquare01Icon} strokeWidth={2} />
            {dashboardLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="ghost"
            nativeButton={false}
            render={<a href={`mailto:${SUPPORT_EMAIL}`} />}
          >
            <HugeiconsIcon data-icon="inline-start" icon={CustomerSupportIcon} strokeWidth={2} />
            {supportLabel}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
