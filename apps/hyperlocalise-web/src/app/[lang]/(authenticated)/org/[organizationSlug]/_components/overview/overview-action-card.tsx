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
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { toneClass, type Tone } from "../workspace-resource-shared";
import { overviewActionCardMessages } from "./overview-action-card.messages";

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
          <FormattedMessage {...overviewActionCardMessages.view} />
        </Button>
      </CardContent>
    </Card>
  );
}
