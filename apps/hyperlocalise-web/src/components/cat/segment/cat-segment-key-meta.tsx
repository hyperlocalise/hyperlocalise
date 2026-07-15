"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/primitives/cn";

export function CatSegmentKeyMeta({
  segmentKey,
  sourcePath,
  className,
  keyClassName,
  pathClassName,
  trailing,
}: {
  segmentKey: string;
  sourcePath?: string | null;
  className?: string;
  keyClassName?: string;
  pathClassName?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <div className="flex min-w-0 items-center gap-1">
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
