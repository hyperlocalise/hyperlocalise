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
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";

import { jobDetailSkeletonMessages as messages } from "./job-detail-skeleton.messages";

function PropertyRowSkeleton() {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-2">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-5 w-full max-w-40" />
    </div>
  );
}

export function JobDetailSkeleton() {
  const intl = useIntl();

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-5"
      aria-busy="true"
      aria-label={intl.formatMessage(messages.loadingJobAriaLabel)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-4">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-full max-w-md" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-36" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-4 h-20 w-full" />
          </section>
          <section className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-3 h-48 w-full" />
          </section>
          <section>
            <Skeleton className="h-5 w-24" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <section className="rounded-lg border border-border bg-card p-5 xl:sticky xl:top-5">
            <Skeleton className="h-5 w-24" />
            <div className="mt-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <PropertyRowSkeleton key={index} />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
