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

import { useIntl } from "react-intl";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { activityTabMessages } from "./activity-tab.messages";

type Intl = ReturnType<typeof useIntl>;

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * One stacked series of a report chart: the largest groups by name, then "Other". `slot` is the
 * series' place among its chart's groups, which keeps its colour when a series before it has
 * nothing to show and is left out; by default, its position in the list.
 */
export type ChartSeries = { label: string; other: boolean; slot?: number };

/** The chart's colours and labels: one colour per series in order, "Other" in grey. */
export function seriesConfig(series: ChartSeries[]) {
  return Object.fromEntries(
    series.map((entry, index) => [
      `s${index}`,
      {
        label: entry.label,
        color: entry.other
          ? "var(--muted-foreground)"
          : SERIES_COLORS[(entry.slot ?? index) % SERIES_COLORS.length],
      },
    ]),
  ) satisfies ChartConfig;
}

/** The series' values of one point, keyed as the config is. */
export function seriesValues(values: number[]): Record<string, number> {
  return Object.fromEntries(values.map((value, index) => [`s${index}`, value]));
}

/** Whether a period's two ends fall in different calendar years, so day labels need the year. */
export function spansYears(period: { from: string; to: string }) {
  return period.from.slice(0, 4) !== period.to.slice(0, 4);
}

/**
 * A day on a chart ("12 Jun"), a week by its first day ("Week of 12 Jun"), or a month by its
 * first day ("Jun"); with the year when the chart spans more than one, so no two labels read
 * the same.
 */
export function chartDayLabel(
  intl: Intl,
  day: string,
  options: { weekly?: boolean; monthly?: boolean; withYear?: boolean } = {},
) {
  if (options.monthly)
    return intl.formatDate(`${day}T00:00:00Z`, {
      month: "short",
      ...(options.withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const date = intl.formatDate(`${day}T00:00:00Z`, {
    day: "numeric",
    month: "short",
    ...(options.withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
  return options.weekly ? intl.formatMessage(activityTabMessages.weekOf, { date }) : date;
}

/** The chart's series as a line of coloured squares and names, for a section's actions. */
export function ChartLegend({
  config,
}: {
  config: Record<string, { label: string; color: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {Object.entries(config).map(([key, entry]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ background: entry.color }}
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Stacked bars, one per point, one stack per series of `config`, with a value formatter for the
 * tooltip and a sentence that sums the chart up for assistive technology.
 */
export function StackedBarChart({
  config,
  rows,
  summary,
  formatValue,
  allowDecimals = false,
  maxBarSize,
}: {
  config: ChartConfig;
  rows: ({ label: string } & Record<string, string | number>)[];
  summary: string;
  formatValue: (value: number) => string;
  allowDecimals?: boolean;
  /** The widest a bar may be, in pixels, so a few bars do not fill the width. */
  maxBarSize?: number;
}) {
  const keys = Object.keys(config);
  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-56 w-full"
      role="img"
      aria-label={summary}
    >
      <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis hide allowDecimals={allowDecimals} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" formatValue={formatValue} />}
        />
        {keys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="stack"
            fill={`var(--color-${key})`}
            radius={index === keys.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={maxBarSize}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
