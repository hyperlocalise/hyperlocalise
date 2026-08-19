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
import { CustomerSupportIcon, DashboardSquare01Icon, Home01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

type NotFoundRecoveryProps = {
  statusCode: string;
  title: string;
  description: string;
  homeLabel: string;
  dashboardLabel: string;
  supportLabel: string;
  homeHref: string;
  dashboardHref: string;
};

export function NotFoundRecovery({
  statusCode,
  title,
  description,
  homeLabel,
  dashboardLabel,
  supportLabel,
  homeHref,
  dashboardHref,
}: NotFoundRecoveryProps) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-12 text-foreground">
      <Empty className="max-w-xl border border-border bg-card px-6 py-12 shadow-sm sm:px-12">
        <EmptyHeader className="max-w-md">
          <p
            aria-hidden="true"
            className="font-heading text-7xl font-semibold tracking-[-0.04em] text-muted-foreground tabular-nums sm:text-8xl"
          >
            {statusCode}
          </p>
          <h1 className="font-heading text-2xl font-semibold text-balance">{title}</h1>
          <EmptyDescription className="max-w-md text-pretty">{description}</EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="max-w-md gap-3 sm:flex-row sm:justify-center">
          <Button
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link href={homeHref} />}
          >
            <HugeiconsIcon data-icon="inline-start" icon={Home01Icon} strokeWidth={2} />
            {homeLabel}
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
