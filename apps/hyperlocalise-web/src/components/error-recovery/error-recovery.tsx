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
import {
  HeadsetIcon,
  SquaresFourIcon,
  ArrowClockwiseIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
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
            <ShieldCheckIcon />
          </EmptyMedia>
          <EmptyTitle className="font-heading text-2xl font-semibold text-balance">
            {title}
          </EmptyTitle>
          <EmptyDescription className="max-w-md text-pretty">{description}</EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="max-w-md gap-3 sm:flex-row sm:justify-center">
          <Button className="w-full sm:w-auto" onClick={retry}>
            <ArrowClockwiseIcon data-icon="inline-start" />
            {tryAgainLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            nativeButton={false}
            render={<Link href={dashboardHref} />}
          >
            <SquaresFourIcon data-icon="inline-start" />
            {dashboardLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="ghost"
            nativeButton={false}
            render={<a href={`mailto:${SUPPORT_EMAIL}`} />}
          >
            <HeadsetIcon data-icon="inline-start" />
            {supportLabel}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
