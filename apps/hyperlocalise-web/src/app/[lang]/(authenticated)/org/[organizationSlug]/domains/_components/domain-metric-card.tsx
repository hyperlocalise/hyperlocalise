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
import { ArrowUp01Icon, ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";
import { Line, LineChart, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/primitives/cn";
import {
  summarizeMetricHistory,
  type DomainMetricPoint,
} from "@/lib/domains/research-metric-history";
import { domainMetricMessages as messages } from "./domain-metric.messages";

export function DomainMetricCard({
  label,
  value,
  history,
}: {
  label: string;
  value: string;
  history?: DomainMetricPoint[];
}) {
  const intl = useIntl();
  const trend = summarizeMetricHistory(history);
  const values = history?.map((point) => point.value) ?? [0];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.15, maximum * 0.02, 1);
  const change = trend
    ? trend.percentage === null
      ? intl.formatNumber(Math.abs(trend.change))
      : intl.formatNumber(Math.abs(trend.percentage), {
          style: "percent",
          maximumFractionDigits: 1,
        })
    : "";
  const trendLabel = trend
    ? intl.formatMessage(
        trend.direction === "up"
          ? messages.increase
          : trend.direction === "down"
            ? messages.decrease
            : messages.unchanged,
        { change },
      )
    : intl.formatMessage(messages.noHistory);
  const tone =
    trend?.direction === "up"
      ? "text-green-900"
      : trend?.direction === "down"
        ? "text-red-900"
        : "text-muted-foreground";
  const icon =
    trend?.direction === "up"
      ? ArrowUp01Icon
      : trend?.direction === "down"
        ? ArrowDown01Icon
        : ArrowRight01Icon;
  return (
    <Card size="sm" className="min-w-0 rounded-lg border border-border bg-card py-0 ring-0">
      <CardContent className="p-4">
        <h2 className="text-sm font-medium text-balance">{label}</h2>
        <p className="mt-2 text-3xl font-medium tabular-nums">{value}</p>
        <p className={cn("mt-2 flex items-center gap-1 text-sm tabular-nums", tone)}>
          {trend ? <HugeiconsIcon icon={icon} className="size-4" aria-hidden /> : null}
          {trendLabel}
        </p>
        {trend ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              {intl.formatMessage(messages.comparison)}
            </p>
            <ChartContainer
              config={{ value: { label } }}
              className={cn("mt-4 h-16 w-full aspect-auto", tone)}
              aria-label={intl.formatMessage(messages.chartLabel, {
                metric: label,
                trend: trendLabel,
              })}
            >
              <LineChart
                data={history}
                accessibilityLayer
                margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              >
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[Math.max(0, minimum - padding), maximum + padding]} />
                <Tooltip
                  labelFormatter={(date) =>
                    intl.formatDate(new Date(`${typeof date === "string" ? date : ""}T00:00:00Z`), {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                  }
                  formatter={(point) => [intl.formatNumber(Number(point)), label]}
                  contentStyle={{
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Line
                  dataKey="value"
                  type="linear"
                  stroke="currentColor"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              {intl.formatMessage(messages.period)}
            </p>
          </>
        ) : (
          <div className="mt-4 h-16 rounded bg-muted/40" aria-hidden />
        )}
      </CardContent>
    </Card>
  );
}
