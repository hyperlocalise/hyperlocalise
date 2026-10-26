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
"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * A headline number, with how it changed against the previous period. The change is shown in a
 * neutral colour: more words or more spending is neither good nor bad in itself.
 */
export function ReportStatCard({
  label,
  value,
  change,
  detail,
}: {
  label: string;
  value: string;
  change?: string;
  detail?: string;
}) {
  return (
    <div className="flex min-h-[132px] min-w-0 flex-col gap-4 rounded-xl border border-border bg-card px-4 pt-4 pb-[18px]">
      <p className="text-[13px] leading-5 font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        <p className="text-3xl/loose font-medium tracking-[-0.03em] text-foreground tabular-nums">
          {value}
        </p>
        {change ? (
          <p className="text-xs leading-4 font-medium text-muted-foreground tabular-nums">
            {change}
          </p>
        ) : null}
        {detail ? (
          <p className="text-[13px] leading-5 text-pretty text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ReportStatCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      {children}
    </div>
  );
}

export function ReportStatCardsSkeleton({ count }: { count: number }) {
  return (
    <ReportStatCards>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="min-h-[132px] rounded-xl" />
      ))}
    </ReportStatCards>
  );
}
