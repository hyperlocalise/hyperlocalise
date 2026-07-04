"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { toneClass, type Tone } from "../workspace-resource-shared";

export function OverviewActionCard({
  category,
  title,
  statusLine,
  statusTone = "info",
  viewHref,
  className,
}: {
  category: string;
  title: string;
  statusLine: string;
  statusTone?: Tone;
  viewHref: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border border-border bg-muted py-0 text-foreground ring-0",
        className,
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 px-5 py-5">
        <div className="flex flex-1 flex-col gap-3">
          <Badge
            variant="outline"
            className="w-fit rounded-full border-border bg-muted text-subtle-foreground"
          >
            {category}
          </Badge>
          <TypographyP className="line-clamp-2 text-sm font-medium text-foreground">
            {title}
          </TypographyP>
          <Badge
            variant="outline"
            className={cn("w-fit rounded-full capitalize", toneClass(statusTone))}
          >
            {statusLine}
          </Badge>
        </div>

        <Button
          nativeButton={false}
          render={<Link href={viewHref} />}
          variant="default"
          size="sm"
          className="w-fit rounded-full"
        >
          View
        </Button>
      </CardContent>
    </Card>
  );
}
