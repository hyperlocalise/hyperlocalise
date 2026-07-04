"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

const DEFAULT_SKELETON_ROWS = 8;

export function CatQueueSkeletonList({
  rowCount = DEFAULT_SKELETON_ROWS,
  className,
}: {
  rowCount?: number;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-hidden px-4 pb-3", className)}>
      <ul className="space-y-2" aria-busy="true" aria-label="Loading segments">
        {Array.from({ length: rowCount }, (_, index) => (
          <li
            key={`cat-queue-skeleton-${index}`}
            className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5"
          >
            <Skeleton className="mt-0.5 size-4 shrink-0 rounded bg-skeleton" />
            <Skeleton className="mt-0.5 h-4 w-5 shrink-0 rounded bg-skeleton" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-full rounded-full bg-skeleton" />
              <Skeleton className="h-4 w-4/5 rounded-full bg-skeleton" />
              <Skeleton className="h-3 w-2/5 rounded-full bg-skeleton" />
            </div>
            <Skeleton className="mt-1 size-2 shrink-0 rounded-full bg-skeleton" />
          </li>
        ))}
      </ul>
    </div>
  );
}
