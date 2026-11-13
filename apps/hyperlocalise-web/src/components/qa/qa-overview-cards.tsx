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
import Image from "next/image";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import {
  PROJECT_OVERVIEW_ACTION_MESH_SRC,
  PROJECT_OVERVIEW_CALM_MESH_SRC,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/project-overview-mesh-stage";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { qaOverviewMessages as messages } from "./qa-overview.messages";

export const QA_OVERVIEW_MAX_CHART_ROWS = 6;
const CHART_ROW_HEIGHT_PX = 32;
const CHART_LABEL_WIDTH_PX = 112;
const CHART_LABEL_MAX_CHARS = 16;
const TREND_CHART_HEIGHT_PX = 160;

export type QaChartRow = { id: string; label: string } & Record<string, number | string>;

function truncateLabel(label: string) {
  return label.length > CHART_LABEL_MAX_CHARS
    ? `${label.slice(0, CHART_LABEL_MAX_CHARS - 1)}…`
    : label;
}

export function qaSeverityChartConfig(intl: ReturnType<typeof useIntl>): ChartConfig {
  return {
    errors: { label: intl.formatMessage(messages.errorsMetric), color: "var(--destructive)" },
    warnings: { label: intl.formatMessage(messages.warningsMetric), color: "var(--color-warning)" },
  };
}

export function qaFindingsChartConfig(
  intl: ReturnType<typeof useIntl>,
  color: string,
): ChartConfig {
  return { findings: { label: intl.formatMessage(messages.findingsSeries), color } };
}

export function QaOverviewTray({
  needsAction,
  isLoading,
  hint,
  metrics,
  charts,
}: {
  needsAction: boolean;
  isLoading?: boolean;
  hint?: string;
  metrics: ReactNode;
  charts: ReactNode;
}) {
  const intl = useIntl();
  return (
    <section
      aria-label={intl.formatMessage(messages.overviewLabel)}
      aria-busy={isLoading || undefined}
      className="relative overflow-clip rounded-3xl border border-border p-3"
    >
      <Image
        src={needsAction ? PROJECT_OVERVIEW_ACTION_MESH_SRC : PROJECT_OVERVIEW_CALM_MESH_SRC}
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1280px) 72rem, 100vw"
        className="object-cover object-center"
        priority
      />
      <div className="relative flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="min-h-[132px] rounded-xl" />
              ))
            : metrics}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="min-h-[220px] rounded-xl" />
              ))
            : charts}
        </div>
        {!isLoading && hint ? (
          <p className="w-fit rounded-lg bg-card/80 px-3 py-1.5 text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function QaMetricCard({
  label,
  value,
  detail,
  emphasis,
  change,
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: "risk" | "watch";
  /** Difference from the previous completed scan for a count where lower is better. */
  change?: number;
}) {
  const intl = useIntl();
  return (
    <div className="flex min-h-[132px] min-w-0 flex-col gap-4 rounded-xl border border-border bg-card px-4 pt-4 pb-[18px]">
      <p className="text-[13px] leading-5 font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "text-3xl/loose font-medium tracking-[-0.03em] text-foreground tabular-nums",
            emphasis === "risk" && "text-destructive",
            emphasis === "watch" && "text-warning-foreground",
          )}
        >
          {value}
        </p>
        {change === undefined ? null : (
          <p
            className={cn(
              "text-xs leading-4 font-medium tabular-nums",
              change > 0 && "text-destructive",
              change < 0 && "text-success",
              change === 0 && "text-muted-foreground",
            )}
          >
            {change === 0
              ? intl.formatMessage(messages.noChange)
              : intl.formatMessage(messages.changeSincePrevious, {
                  change: intl.formatNumber(change, { signDisplay: "always" }),
                })}
          </p>
        )}
        <p className="text-[13px] leading-5 text-pretty text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function chartAriaLabel(
  intl: ReturnType<typeof useIntl>,
  title: string,
  rows: QaChartRow[],
  keys: string[],
) {
  return intl.formatMessage(messages.chartAriaLabel, {
    title,
    values: rows
      .map((row) =>
        intl.formatMessage(messages.chartValue, {
          label: row.label,
          count: intl.formatNumber(keys.reduce((sum, key) => sum + Number(row[key] ?? 0), 0)),
        }),
      )
      .join(", "),
  });
}

function QaChartCardFrame({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[13px] leading-5 font-medium text-foreground">{title}</h2>
        {note ? <p className="text-xs text-muted-foreground tabular-nums">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function QaChartEmpty({ text }: { text: string }) {
  return <p className="flex min-h-24 items-center text-sm text-muted-foreground">{text}</p>;
}

/** Horizontal bars, largest first. Stacks every series key in `series`. */
export function QaBarChartCard({
  title,
  rows,
  total,
  series,
  emptyText,
  onSelect,
}: {
  title: string;
  rows: QaChartRow[];
  total: number;
  series: ChartConfig;
  emptyText?: string;
  onSelect: (id: string) => void;
}) {
  const intl = useIntl();
  const keys = Object.keys(series);
  return (
    <QaChartCardFrame
      title={title}
      note={
        total > rows.length
          ? intl.formatMessage(messages.topRows, { shown: rows.length, total })
          : undefined
      }
    >
      {rows.length ? (
        <ChartContainer
          config={series}
          className="aspect-auto w-full [&_.recharts-bar-rectangle]:cursor-pointer"
          style={{ height: rows.length * CHART_ROW_HEIGHT_PX + 8 }}
          aria-label={chartAriaLabel(intl, title, rows, keys)}
          role="img"
        >
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={6}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={CHART_LABEL_WIDTH_PX}
              tickLine={false}
              axisLine={false}
              tickFormatter={truncateLabel}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            {keys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="findings"
                fill={`var(--color-${key})`}
                radius={index === keys.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
                onClick={(_, rowIndex) => {
                  const row = rows[rowIndex];
                  if (row) onSelect(row.id);
                }}
              />
            ))}
          </BarChart>
        </ChartContainer>
      ) : (
        <QaChartEmpty text={emptyText ?? intl.formatMessage(messages.chartEmpty)} />
      )}
    </QaChartCardFrame>
  );
}

/** Stacked errors and warnings per scan, oldest on the left. */
export function QaTrendChartCard({
  rows,
  selectedId,
  onSelect,
}: {
  rows: QaChartRow[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const intl = useIntl();
  const title = intl.formatMessage(messages.trendTitle);
  const series = qaSeverityChartConfig(intl);
  const keys = Object.keys(series);
  return (
    <QaChartCardFrame title={title}>
      {rows.length > 1 ? (
        <>
          <ChartContainer
            config={series}
            className="aspect-auto w-full [&_.recharts-bar-rectangle]:cursor-pointer"
            style={{ height: TREND_CHART_HEIGHT_PX }}
            aria-hidden
          >
            <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
              {keys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="findings"
                  fill={`var(--color-${key})`}
                  radius={index === keys.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                  onClick={(_, rowIndex) => {
                    const row = rows[rowIndex];
                    if (row) onSelect(row.id);
                  }}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.id}
                      fillOpacity={selectedId && row.id !== selectedId ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ChartContainer>
          <div
            role="group"
            aria-label={intl.formatMessage(messages.selectScan)}
            className="flex flex-wrap gap-1"
          >
            {rows.map((row) => {
              const selected = row.id === selectedId;
              return (
                <Button
                  key={row.id}
                  type="button"
                  size="xs"
                  variant={selected ? "secondary" : "ghost"}
                  aria-pressed={selected}
                  aria-label={intl.formatMessage(messages.selectScanOption, {
                    label: row.label,
                    errors: intl.formatNumber(Number(row.errors ?? 0)),
                    warnings: intl.formatNumber(Number(row.warnings ?? 0)),
                  })}
                  onClick={() => onSelect(row.id)}
                >
                  {row.label}
                </Button>
              );
            })}
          </div>
        </>
      ) : (
        <QaChartEmpty text={intl.formatMessage(messages.trendEmpty)} />
      )}
    </QaChartCardFrame>
  );
}
