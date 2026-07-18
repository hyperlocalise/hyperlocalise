"use client";

import { FormattedMessage } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { overviewSectionHeaderMessages as messages } from "./overview-section-header.messages";

export function OverviewSectionHeader({
  title,
  count,
  className,
}: {
  title: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <TypographyP className="text-base font-medium text-foreground">{title}</TypographyP>
      {count !== undefined && count > 0 ? (
        <Badge
          variant="outline"
          className="size-5 justify-center rounded-full border-beam-500/30 bg-beam-500/15 p-0 text-xs font-medium text-beam-100"
        >
          {count > 9 ? <FormattedMessage {...messages.cappedCount} /> : count}
        </Badge>
      ) : null}
    </div>
  );
}
