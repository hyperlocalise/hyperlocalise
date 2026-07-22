"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { TypographyH4, TypographyMuted, TypographySmall } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { monitorO11yBentoMessages } from "./monitor-o11y-bento.messages";

const readinessRowDefs = [
  {
    locale: "fr-FR",
    summaryKey: "summaryShipSafe" as const,
    summaryTone: "safe" as const,
    cells: [
      { key: "quality", score: 96, tone: "safe" as const },
      { key: "coverage", score: 94, tone: "safe" as const },
      { key: "drift", score: 91, tone: "safe" as const },
      { key: "freshness", score: 95, tone: "safe" as const },
    ],
  },
  {
    locale: "de-DE",
    summaryKey: "summaryShipSafe" as const,
    summaryTone: "safe" as const,
    cells: [
      { key: "quality", score: 93, tone: "safe" as const },
      { key: "coverage", score: 91, tone: "safe" as const },
      { key: "drift", score: 89, tone: "watch" as const },
      { key: "freshness", score: 92, tone: "safe" as const },
    ],
  },
  {
    locale: "es-ES",
    summaryKey: "summaryReviewDue" as const,
    summaryTone: "watch" as const,
    cells: [
      { key: "quality", score: 90, tone: "watch" as const },
      { key: "coverage", score: 78, tone: "watch" as const },
      { key: "drift", score: 88, tone: "watch" as const },
      { key: "freshness", score: 91, tone: "safe" as const },
    ],
  },
  {
    locale: "ja-JP",
    summaryKey: "summaryReviewDue" as const,
    summaryTone: "watch" as const,
    cells: [
      { key: "quality", score: 88, tone: "watch" as const },
      { key: "coverage", score: 80, tone: "watch" as const },
      { key: "drift", score: 82, tone: "watch" as const },
      { key: "freshness", score: 89, tone: "watch" as const },
    ],
  },
  {
    locale: "pt-BR",
    summaryKey: "summaryBlocked" as const,
    summaryTone: "risk" as const,
    cells: [
      { key: "quality", score: 81, tone: "risk" as const },
      { key: "coverage", score: 64, tone: "risk" as const },
      { key: "drift", score: 76, tone: "risk" as const },
      { key: "freshness", score: 83, tone: "watch" as const },
    ],
  },
  {
    locale: "ko-KR",
    summaryKey: "summaryShipSafe" as const,
    summaryTone: "safe" as const,
    cells: [
      { key: "quality", score: 94, tone: "safe" as const },
      { key: "coverage", score: 92, tone: "safe" as const },
      { key: "drift", score: 90, tone: "safe" as const },
      { key: "freshness", score: 94, tone: "safe" as const },
    ],
  },
];

const reviewCoverageData = [
  { locale: "fr", drafted: 18, reviewed: 72, blocked: 10 },
  { locale: "de", drafted: 16, reviewed: 70, blocked: 14 },
  { locale: "es", drafted: 22, reviewed: 58, blocked: 20 },
  { locale: "ja", drafted: 20, reviewed: 56, blocked: 24 },
  { locale: "pt", drafted: 24, reviewed: 46, blocked: 30 },
  { locale: "ko", drafted: 14, reviewed: 74, blocked: 12 },
] as const;

function getReadinessCellClassName(tone: "safe" | "watch" | "risk") {
  if (tone === "safe") {
    return "border-[color:var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_16%,var(--color-card))] text-[color:var(--color-success)]";
  }

  if (tone === "watch") {
    return "border-[color:var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_16%,var(--color-card))] text-[color:var(--color-warning)]";
  }

  return "border-[color:var(--color-error)] bg-[color:color-mix(in_srgb,var(--color-error)_16%,var(--color-card))] text-[color:var(--color-error)]";
}

function getReadinessSummaryClassName(tone: "safe" | "watch" | "risk") {
  if (tone === "safe") {
    return "border-[color:var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_14%,var(--color-card))] text-[color:var(--color-success)]";
  }

  if (tone === "watch") {
    return "border-[color:var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_16%,var(--color-card))] text-[color:var(--color-warning)]";
  }

  return "border-[color:var(--color-error)] bg-[color:color-mix(in_srgb,var(--color-error)_12%,var(--color-card))] text-[color:var(--color-error)]";
}

function MonitorCard({
  title,
  eyebrow,
  children,
  className,
}: {
  title: ReactNode;
  eyebrow: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.45rem] border border-border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-card)_96%,var(--color-muted)),color-mix(in_srgb,var(--color-background)_92%,var(--color-card)))] p-4 shadow-[0_18px_40px_color-mix(in_srgb,var(--foreground)_10%,transparent)] backdrop-blur-sm sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
          <TypographyH4 className="mt-2 text-base text-foreground">{title}</TypographyH4>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const CURRENT_COVERAGE_VALUE = "92%";

export function MonitorO11yBento() {
  const intl = useIntl();

  const readinessColumns = [
    { key: "quality", label: intl.formatMessage(monitorO11yBentoMessages.columnQuality) },
    { key: "coverage", label: intl.formatMessage(monitorO11yBentoMessages.columnReview) },
    { key: "drift", label: intl.formatMessage(monitorO11yBentoMessages.columnDrift) },
    { key: "freshness", label: intl.formatMessage(monitorO11yBentoMessages.columnSync) },
  ] as const;

  const readinessRows = readinessRowDefs.map((row) => ({
    ...row,
    summary: intl.formatMessage(monitorO11yBentoMessages[row.summaryKey]),
  }));

  const qualityTrendData = [
    { run: "R-18", score: 89 },
    { run: "R-12", score: 91 },
    { run: "R-9", score: 86 },
    { run: "R-6", score: 84 },
    { run: "R-3", score: 90 },
    { run: intl.formatMessage(monitorO11yBentoMessages.runToday), score: 92 },
  ];

  const issueBreakdownData = [
    {
      issue: intl.formatMessage(monitorO11yBentoMessages.issueTerminology),
      count: 18,
    },
    { issue: intl.formatMessage(monitorO11yBentoMessages.issueIcu), count: 11 },
    {
      issue: intl.formatMessage(monitorO11yBentoMessages.issueBrandVoice),
      count: 9,
    },
    { issue: intl.formatMessage(monitorO11yBentoMessages.issueLength), count: 7 },
    { issue: intl.formatMessage(monitorO11yBentoMessages.issueContext), count: 5 },
  ];

  const releasePulse = [
    {
      label: intl.formatMessage(monitorO11yBentoMessages.pulseShipSafe),
      value: "92%",
    },
    {
      label: intl.formatMessage(monitorO11yBentoMessages.pulseReviewSla),
      value: "4.1h",
    },
    {
      label: intl.formatMessage(monitorO11yBentoMessages.pulseCriticalBlockers),
      value: "1",
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-[1.8rem] border border-border bg-[linear-gradient(180deg,var(--color-card),color-mix(in_srgb,var(--color-card)_72%,var(--color-muted)))] shadow-[0_30px_90px_color-mix(in_srgb,var(--foreground)_16%,transparent)] mask-radial-from-65% mask-radial-at-top">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--color-success)_18%,transparent),transparent_42%),radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-info)_16%,transparent),transparent_36%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-background)_0%,transparent),color-mix(in_srgb,var(--color-muted)_48%,transparent)_58%,color-mix(in_srgb,var(--color-card)_92%,var(--color-muted)))]"
      />

      <div className="relative border-b border-border px-5 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <TypographyH4 className="text-foreground">
                <FormattedMessage {...monitorO11yBentoMessages.pageTitle} />
              </TypographyH4>
              <Badge className="rounded-full border-(--color-success) bg-[color-mix(in_srgb,var(--color-success)_14%,var(--color-card))] px-3 text-(--color-success)">
                <FormattedMessage {...monitorO11yBentoMessages.releaseWindowBadge} />
              </Badge>
            </div>
            <TypographyMuted className="mt-2 max-w-2xl text-muted-foreground">
              <FormattedMessage {...monitorO11yBentoMessages.pageSubtitle} />
            </TypographyMuted>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {releasePulse.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border bg-background/70 px-3 py-3 text-right"
              >
                <TypographyMuted className="text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                  {item.label}
                </TypographyMuted>
                <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground tabular-nums sm:text-xl">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative grid gap-4 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-background)_50%,transparent),color-mix(in_srgb,var(--color-muted)_45%,transparent))] p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <MonitorCard
          eyebrow={<FormattedMessage {...monitorO11yBentoMessages.readinessEyebrow} />}
          title={<FormattedMessage {...monitorO11yBentoMessages.readinessTitle} />}
          className="lg:row-span-1"
        >
          <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))_auto] gap-2 text-xs text-muted-foreground">
            <div />
            {readinessColumns.map((column) => (
              <div
                key={column.key}
                className="px-2 pb-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {column.label}
              </div>
            ))}
            <div className="pb-1 text-right text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <FormattedMessage {...monitorO11yBentoMessages.columnStatus} />
            </div>

            {readinessRows.map((row) => (
              <div key={row.locale} className="contents">
                <div className="flex items-center text-sm font-medium text-foreground">
                  {row.locale}
                </div>
                {row.cells.map((cell) => (
                  <div
                    key={`${row.locale}-${cell.key}`}
                    className={cn(
                      "rounded-xl border px-2 py-3 text-center text-sm font-semibold tabular-nums",
                      getReadinessCellClassName(cell.tone),
                    )}
                  >
                    {cell.score}
                  </div>
                ))}
                <div className="flex items-center justify-end">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-2.5 py-0 text-[0.7rem] font-medium",
                      getReadinessSummaryClassName(row.summaryTone),
                    )}
                  >
                    {row.summary}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </MonitorCard>

        <MonitorCard
          eyebrow={<FormattedMessage {...monitorO11yBentoMessages.evalEyebrow} />}
          title={<FormattedMessage {...monitorO11yBentoMessages.evalTitle} />}
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">
                {CURRENT_COVERAGE_VALUE}
              </div>
              <TypographyMuted className="text-muted-foreground">
                <FormattedMessage {...monitorO11yBentoMessages.currentCoverage} />
              </TypographyMuted>
            </div>
            <Badge className="rounded-full border-(--color-success) bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-card))] px-3 text-(--color-success)">
              <FormattedMessage {...monitorO11yBentoMessages.recoveryBadge} />
            </Badge>
          </div>

          <div className="h-52 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={qualityTrendData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="color-mix(in srgb, var(--border) 70%, transparent)"
                />
                <XAxis
                  dataKey="run"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fill: "color-mix(in srgb, var(--muted-foreground) 80%, transparent)",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  domain={[80, 96]}
                  tickCount={5}
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fill: "color-mix(in srgb, var(--muted-foreground) 80%, transparent)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 0, fill: "var(--chart-1)" }}
                  activeDot={{ r: 5, fill: "var(--chart-2)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </MonitorCard>

        <MonitorCard
          eyebrow={<FormattedMessage {...monitorO11yBentoMessages.coverageEyebrow} />}
          title={<FormattedMessage {...monitorO11yBentoMessages.coverageTitle} />}
        >
          <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-chart-4" />
              <FormattedMessage {...monitorO11yBentoMessages.legendAiDrafted} />
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-chart-1" />
              <FormattedMessage {...monitorO11yBentoMessages.legendHumanReviewed} />
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-(--color-error)" />
              <FormattedMessage {...monitorO11yBentoMessages.legendBlocked} />
            </div>
          </div>

          <div className="h-52 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reviewCoverageData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                barCategoryGap={18}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="color-mix(in srgb, var(--border) 70%, transparent)"
                />
                <XAxis
                  dataKey="locale"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fill: "color-mix(in srgb, var(--muted-foreground) 80%, transparent)",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fill: "color-mix(in srgb, var(--muted-foreground) 80%, transparent)",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="drafted"
                  stackId="coverage"
                  fill="var(--chart-4)"
                  radius={[0, 0, 6, 6]}
                />
                <Bar dataKey="reviewed" stackId="coverage" fill="var(--chart-1)" />
                <Bar
                  dataKey="blocked"
                  stackId="coverage"
                  fill="var(--color-error)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MonitorCard>

        <MonitorCard
          eyebrow={<FormattedMessage {...monitorO11yBentoMessages.failureEyebrow} />}
          title={<FormattedMessage {...monitorO11yBentoMessages.failureTitle} />}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <TypographyMuted className="text-muted-foreground">
              <FormattedMessage {...monitorO11yBentoMessages.failureCaption} />
            </TypographyMuted>
            <TypographySmall className="text-foreground">
              <FormattedMessage {...monitorO11yBentoMessages.totalFindings} />
            </TypographySmall>
          </div>

          <div className="h-52 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={issueBreakdownData}
                layout="vertical"
                margin={{ top: 6, right: 18, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="color-mix(in srgb, var(--border) 70%, transparent)"
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fill: "color-mix(in srgb, var(--muted-foreground) 80%, transparent)",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="issue"
                  width={82}
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fill: "color-mix(in srgb, var(--foreground) 72%, transparent)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {issueBreakdownData.map((entry, index) => (
                    <Cell
                      key={entry.issue}
                      fill={
                        index === 0
                          ? "var(--chart-1)"
                          : index === 1
                            ? "var(--chart-2)"
                            : index === 2
                              ? "var(--chart-3)"
                              : index === 3
                                ? "var(--chart-4)"
                                : "var(--chart-5)"
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    fill="color-mix(in srgb, var(--foreground) 78%, transparent)"
                    fontSize={12}
                  />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </MonitorCard>
      </div>
    </div>
  );
}
