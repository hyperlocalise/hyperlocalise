"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

export type OverviewSnapshotRow = {
  label: string;
  value: ReactNode;
};

export function OverviewSnapshotCard({
  title,
  rows,
  ctaLabel,
  ctaHref,
  className,
}: {
  title: string;
  rows: readonly OverviewSnapshotRow[];
  ctaLabel: string;
  ctaHref: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0",
        className,
      )}
    >
      <CardHeader className="px-5 pt-5 pb-0">
        <CardTitle className="text-base font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-5 px-5 pt-4 pb-5">
        <dl className="grid gap-3">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-0.5">
              <TypographyP className="text-xs text-muted-foreground">{row.label}</TypographyP>
              <TypographyP className="text-sm font-medium text-foreground">{row.value}</TypographyP>
            </div>
          ))}
        </dl>

        <Button
          nativeButton={false}
          render={<Link href={ctaHref} />}
          variant="outline"
          size="sm"
          className="mt-auto w-fit rounded-full"
        >
          {ctaLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
