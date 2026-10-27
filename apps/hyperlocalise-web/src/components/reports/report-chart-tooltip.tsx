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

import type { ComponentProps } from "react";

import { ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/**
 * The tooltip of a Reports chart: each series' colour, name and value, with the value set apart
 * from its name, in the same typeface and in the page's own number format (the shared tooltip
 * runs them together in a monospace face and the browser's format).
 */
export function ReportChartTooltipContent({
  config,
  formatValue,
  ...props
}: ComponentProps<typeof ChartTooltipContent> & {
  config: ChartConfig;
  formatValue: (value: number) => string;
}) {
  return (
    <ChartTooltipContent
      indicator="dot"
      {...props}
      formatter={(value, name) => (
        <span className="flex w-full items-center gap-4">
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: config[String(name)]?.color }}
            />
            {config[String(name)]?.label}
          </span>
          <span className="ms-auto font-medium text-foreground tabular-nums">
            {formatValue(Number(value))}
          </span>
        </span>
      )}
    />
  );
}
