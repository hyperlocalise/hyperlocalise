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

import { InfoIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Children } from "react";
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

import type { ReportTrend } from "./report-format";
import { reportsPageMessages as messages } from "./reports-page.messages";

const TREND_TONES = {
  good: "text-green-900",
  bad: "text-red-900",
  neutral: "text-muted-foreground",
} as const;

function trendTone(trend: ReportTrend | undefined, goodWhen: "up" | "down" | undefined) {
  if (!trend || trend === "flat" || !goodWhen) return TREND_TONES.neutral;
  return trend === goodWhen ? TREND_TONES.good : TREND_TONES.bad;
}

/**
 * One figure of a report. `detail` is data and always shows; `hint` says what the figure means
 * and shows on hovering the info icon. The featured card is the tab's headline figure.
 */
export function ReportStatCard({
  label,
  value,
  change,
  trend,
  goodWhen,
  detail,
  hint,
  featured = false,
  sparkline,
}: {
  label: string;
  value: string;
  change?: string;
  /** Which way the change went; colours it when `goodWhen` says which way is good. */
  trend?: ReportTrend;
  goodWhen?: "up" | "down";
  detail?: string;
  hint?: string;
  featured?: boolean;
  /** The figure over the period, oldest first, drawn small beside a featured value. */
  sparkline?: number[];
}) {
  const intl = useIntl();
  const TrendIcon = trend === "up" ? TrendUpIcon : trend === "down" ? TrendDownIcon : null;
  return (
    <div
      data-slot="report-stat-card"
      data-featured={featured || undefined}
      className={cn(
        "flex min-w-0 flex-col justify-between gap-3 rounded-xl border bg-card p-4",
        featured && "border-primary/25 bg-primary/[0.04]",
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <p className="truncate text-[13px] leading-5 font-medium text-muted-foreground">{label}</p>
        {hint ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={intl.formatMessage(messages.aboutMetric, { metric: label })}
                  className="inline-flex shrink-0 rounded-full text-subtle-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                />
              }
            >
              <InfoIcon aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {hint ? <p className="sr-only">{hint}</p> : null}
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p
            className={cn(
              "font-semibold tracking-[-0.03em] text-foreground tabular-nums",
              featured ? "text-4xl/tight" : "text-2xl/tight",
            )}
          >
            {value}
          </p>
          {change ? (
            <p
              className={cn(
                "inline-flex items-center gap-1 text-xs leading-4 font-medium tabular-nums",
                trendTone(trend, goodWhen),
              )}
            >
              {TrendIcon ? <TrendIcon aria-hidden className="size-3.5 shrink-0" /> : null}
              {change}
            </p>
          ) : null}
          {detail ? (
            <p className="text-xs leading-4 text-pretty text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        {featured && sparkline && sparkline.length > 1 ? <Sparkline values={sparkline} /> : null}
      </div>
    </div>
  );
}

const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 40;

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const step = SPARKLINE_WIDTH / (values.length - 1);
  // A pixel of room at the top and bottom so the line's stroke is not clipped.
  const points = values.map(
    (value, index) =>
      `${(index * step).toFixed(1)},${(SPARKLINE_HEIGHT - 1 - (value / max) * (SPARKLINE_HEIGHT - 2)).toFixed(1)}`,
  );
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      className="hidden h-10 w-[120px] shrink-0 text-primary @md:block"
      preserveAspectRatio="none"
    >
      <polygon
        points={`0,${SPARKLINE_HEIGHT} ${points.join(" ")} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`}
        className="fill-current opacity-10"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Columns for each number of cards, so every row is full. Five or seven cards leave a gap, which
 * the featured card fills by spanning two columns.
 */
const GRID_COLUMNS: Record<number, string> = {
  1: "",
  2: "@md:grid-cols-2",
  3: "@2xl:grid-cols-3",
  4: "@md:grid-cols-2 @4xl:grid-cols-4",
  5: "@md:grid-cols-2 @5xl:grid-cols-6",
  6: "@md:grid-cols-2 @3xl:grid-cols-3",
  7: "@md:grid-cols-2 @4xl:grid-cols-4",
};
const FEATURED_SPANS = new Set([5, 7]);

export function ReportStatCards({ children }: { children: React.ReactNode }) {
  const count = Children.toArray(children).length;
  return (
    <div className="@container">
      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          GRID_COLUMNS[count] ?? GRID_COLUMNS[4],
          FEATURED_SPANS.has(count) && "@md:[&>[data-featured]]:col-span-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ReportStatCardsSkeleton({ count }: { count: number }) {
  return (
    <ReportStatCards>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          data-featured={index === 0 || undefined}
          className="min-h-[116px] rounded-xl"
        />
      ))}
    </ReportStatCards>
  );
}
