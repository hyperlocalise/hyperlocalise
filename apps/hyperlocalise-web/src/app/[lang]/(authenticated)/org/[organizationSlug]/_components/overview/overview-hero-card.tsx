"use client";

import Link from "next/link";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

export function OverviewHeroCard({
  pendingCount,
  title,
  description,
  ctaLabel,
  ctaHref,
  className,
}: {
  pendingCount: number;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  className?: string;
}) {
  const isCaughtUp = pendingCount === 0;

  return (
    <Card
      className={cn(
        "rounded-2xl border border-border py-0 text-foreground ring-0",
        isCaughtUp
          ? "bg-gradient-to-br from-grove-700/15 via-muted to-muted"
          : "bg-gradient-to-br from-amber-100 via-muted to-muted",
        className,
      )}
    >
      <CardContent className="flex h-full flex-col justify-between gap-6 px-6 py-6">
        <div>
          <TypographyP className="text-sm font-medium text-subtle-foreground">
            {isCaughtUp
              ? "All caught up"
              : `${pendingCount} pending ${pendingCount === 1 ? "action" : "actions"}`}
          </TypographyP>
          <TypographyP className="mt-2 font-heading text-2xl font-medium text-foreground">
            {title}
          </TypographyP>
          <TypographyP className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {description}
          </TypographyP>
        </div>

        <Button
          nativeButton={false}
          render={<Link href={ctaHref} />}
          variant="default"
          className="w-fit rounded-full"
        >
          {ctaLabel}
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
        </Button>
      </CardContent>
    </Card>
  );
}
