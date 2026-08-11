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
import { cn } from "@/lib/primitives/cn";

import type { IssuePriorityValue } from "./issue-detail-utils";

const PRIORITY_CIRCLE: Record<IssuePriorityValue, string> = {
  P0: "bg-red-500 text-white",
  P1: "bg-amber-500 text-white",
  P2: "bg-slate-400 text-white dark:bg-slate-500",
};

export function IssuePriorityIcon({
  priority,
  className,
  size = "default",
}: {
  priority: string | null | undefined;
  className?: string;
  size?: "default" | "sm";
}) {
  const known = priority ? PRIORITY_CIRCLE[priority as IssuePriorityValue] : null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none",
        size === "sm" ? "size-5 text-[9px]" : "size-6 text-[10px]",
        known ??
          "border border-dashed border-muted-foreground/50 bg-transparent text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {known ? priority : null}
    </span>
  );
}
