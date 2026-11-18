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
import type { ReactNode } from "react";

import { cn } from "@/lib/primitives/cn";

export function ContentEditorSegmentKeyMeta({
  segmentKey,
  sourcePath,
  className,
  keyClassName,
  pathClassName,
  trailing,
  inline = false,
}: {
  segmentKey: string;
  sourcePath?: string | null;
  className?: string;
  keyClassName?: string;
  pathClassName?: string;
  trailing?: ReactNode;
  /** Key and path share one line; the path truncates first. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className={cn("flex min-w-0 items-center gap-1.5 font-mono text-[11px]", className)}>
        <span
          className={cn("max-w-[60%] shrink-0 truncate text-foreground", keyClassName)}
          title={segmentKey}
        >
          {segmentKey}
        </span>
        {sourcePath ? (
          <>
            <span className="shrink-0 text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span
              className={cn("min-w-0 truncate text-muted-foreground", pathClassName)}
              title={sourcePath}
            >
              {sourcePath}
            </span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[11px] leading-5 text-muted-foreground",
            keyClassName,
          )}
          title={segmentKey}
        >
          {segmentKey}
        </p>
        {trailing}
      </div>
      {sourcePath ? (
        <p
          className={cn(
            "min-w-0 truncate font-mono text-[0.6875rem] leading-4 text-muted-foreground/80",
            pathClassName,
          )}
          title={sourcePath}
        >
          {sourcePath}
        </p>
      ) : null}
    </div>
  );
}
