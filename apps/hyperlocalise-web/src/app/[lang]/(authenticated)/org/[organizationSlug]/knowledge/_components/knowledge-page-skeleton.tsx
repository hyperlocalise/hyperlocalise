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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function KnowledgePageSkeleton() {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[34rem] flex-col"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Skeleton className="h-4 w-28 rounded-md" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-28 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </div>
      </div>
      <Separator />
      <div className="flex flex-1 flex-col gap-3 px-1 py-6">
        <Skeleton className="h-4 w-2/5 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-11/12 rounded-md" />
        <Skeleton className="h-4 w-4/5 rounded-md" />
        <Skeleton className="mt-4 h-4 w-1/3 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-5/6 rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
      </div>
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Skeleton className="h-3 w-40 rounded-md" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
    </section>
  );
}
