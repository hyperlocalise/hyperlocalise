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
import { FormattedMessage } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import type { ContentOpsMockTabId } from "./content-ops-mock-stage.messages";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

export type ContentOpsActivityItem = {
  time: string;
  source: string;
  message: string;
};

export function ContentOpsActivityFeed({
  items,
  className,
}: {
  items: ContentOpsActivityItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-muted/20 px-4 py-3",
        className,
      )}
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Activity
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
          <FormattedMessage {...contentOpsMockStageMessages.activityLive} />
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.time}-${item.source}-${item.message}`} className="flex gap-3 text-xs">
            <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground/70">
              {item.time}
            </span>
            <span className="w-16 shrink-0 font-medium text-muted-foreground">{item.source}</span>
            <span className="min-w-0 text-foreground/85">{item.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { ContentOpsMockTabId };
