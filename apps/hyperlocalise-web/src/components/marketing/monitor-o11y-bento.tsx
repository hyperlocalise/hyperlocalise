"use client";

import type { ReactNode } from "react";

import { motion, useReducedMotion } from "motion/react";
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
import { cn } from "@/lib/utils";

const readinessColumns = [
  { key: "quality", label: "Quality" },
  { key: "coverage", label: "Review" },
  { key: "drift", label: "Drift" },
  { key: "freshness", label: "Sync" },
] as const;

const readinessRows = [
  {
    locale: "fr-FR",
    summary: "Ship-safe",
    summaryTone: "text-emerald-300",
    cells: [
      { key: "quality", score: 96, tone: "safe" },
      { key: "coverage", score: 94, tone: "safe" },
      { key: "drift", score: 91, tone: "safe" },
      { key: "freshness", score: 95, tone: "safe" },
    ],
  },
  {
    locale: "de-DE",
    summary: "Ship-safe",
    summaryTone: "text-emerald-300",
    cells: [
      { key: "quality", score: 93, tone: "safe" },
      { key: "coverage", score: 91, tone: "safe" },
      { key: "drift", score: 89, tone: "watch" },
      { key: "freshness", score: 92, tone: "safe" },
    ],
  },
  {
    locale: "es-ES",
    summary: "Review due",
    summaryTone: "text-amber-300",
    cells: [
      { key: "quality", score: 90, tone: "watch" },
      { key: "coverage", score: 78, tone: "watch" },
      { key: "drift", score: 88, tone: "watch" },
      { key: "freshness", score: 91, tone: "safe" },
    ],
  },
  {
    locale: "ja-JP",
    summary: "Review due",
    summaryTone: "text-amber-300",
    cells: [
      { key: "quality", score: 88, tone: "watch" },
      { key: "coverage", score: 80, tone: "watch" },
      { key: "drift", score: 82, tone: "watch" },
      { key: "freshness", score: 89, tone: "watch" },
    ],
  },
  {
    locale: "pt-BR",
    summary: "Blocked",
    summaryTone: "text-rose-300",
    cells: [
      { key: "quality", score: 81, tone: "risk" },
      { key: "coverage", score: 64, tone: "risk" },
      { key: "drift", score: 76, tone: "risk" },
      { key: "freshness", score: 83, tone: "watch" },
    ],
  },
  {
    locale: "ko-KR",
    summary: "Ship-safe",
    summaryTone: "text-emerald-300",
    cells: [
      { key: "quality", score: 94, tone: "safe" },
      { key: "coverage", score: 92, tone: "safe" },
      { key: "drift", score: 90, tone: "safe" },
      { key: "freshness", score: 94, tone: "safe" },
    ],
  },
] as const;

const qualityTrendData = [
  { run: "R-18", score: 89 },
  { run: "R-12", score: 91 },
  { run: "R-9", score: 86 },
  { run: "R-6", score: 84 },
  { run: "R-3", score: 90 },
  { run: "Today", score: 92 },
] as const;

const reviewCoverageData = [
  { locale: "fr", drafted: 18, reviewed: 72, blocked: 10 },
  { locale: "de", drafted: 16, reviewed: 70, blocked: 14 },
  { locale: "es", drafted: 22, reviewed: 58, blocked: 20 },
  { locale: "ja", drafted: 20, reviewed: 56, blocked: 24 },
  { locale: "pt", drafted: 24, reviewed: 46, blocked: 30 },
  { locale: "ko", drafted: 14, reviewed: 74, blocked: 12 },
] as const;

const issueBreakdownData = [
  { issue: "Terminology", count: 18 },
  { issue: "ICU", count: 11 },
  { issue: "Brand voice", count: 9 },
  { issue: "Length", count: 7 },
  { issue: "Context", count: 5 },
] as const;

const releasePulse = [
  { label: "Ship-safe locales", value: "92%" },
  { label: "Review SLA", value: "4.1h" },
  { label: "Critical blockers", value: "1" },
] as const;

const EASE_OUT = [0.19, 1, 0.22, 1] as const;

function getReadinessCellClassName(tone: "safe" | "watch" | "risk") {
  if (tone === "safe") {
    return "border-emerald-400/30 bg-emerald-400/18 text-emerald-100";
  }

  if (tone === "watch") {
    return "border-amber-400/30 bg-amber-300/16 text-amber-50";
  }

  return "border-rose-400/30 bg-rose-400/16 text-rose-50";
}

function MonitorCard({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-sm sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/35">
            {eyebrow}
          </div>
          <TypographyH4 className="mt-2 text-base text-white">{title}</TypographyH4>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function MonitorO11yBento() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0a0a0a] shadow-[0_30px_90px_rgba(0,0,0,0.42)] mask-radial-from-65% mask-radial-at-left"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.55, ease: EASE_OUT }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_left,rgba(79,180,141,0.2),transparent_42%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_36%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,rgba(10,10,10,0),rgba(10,10,10,0.62)_58%,rgba(10,10,10,0.96))]"
      />

      <div className="relative border-b border-white/8 px-5 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <TypographyH4 className="text-white">Locale ops observability</TypographyH4>
              <Badge className="rounded-full border border-emerald-400/20 bg-emerald-300/14 px-3 text-emerald-100">
                Release window active
              </Badge>
            </div>
            <TypographyMuted className="mt-2 max-w-2xl text-white/55">
              Ship confidence across eval health, review debt, and failure modes.
            </TypographyMuted>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {releasePulse.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3 text-right"
              >
                <TypographyMuted className="text-[0.68rem] uppercase tracking-[0.16em] text-white/34">
                  {item.label}
                </TypographyMuted>
                <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white tabular-nums sm:text-xl">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative grid gap-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <MonitorCard
          eyebrow="Release Readiness"
          title="Locale readiness heatmap"
          className="lg:row-span-1"
        >
          <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))_auto] gap-2 text-xs text-white/42">
            <div />
            {readinessColumns.map((column) => (
              <div
                key={column.key}
                className="px-2 pb-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/35"
              >
                {column.label}
              </div>
            ))}
            <div className="pb-1 text-right text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/35">
              Status
            </div>

            {readinessRows.map((row) => (
              <div key={row.locale} className="contents">
                <div className="flex items-center text-sm font-medium text-white/82">
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
                <div
                  className={cn(
                    "flex items-center justify-end text-sm font-medium",
                    row.summaryTone,
                  )}
                >
                  {row.summary}
                </div>
              </div>
            ))}
          </div>
        </MonitorCard>

        <MonitorCard eyebrow="Eval Trend" title="Quality score over recent runs">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold tracking-[-0.04em] text-white tabular-nums">
                92%
              </div>
              <TypographyMuted className="text-white/50">
                current ship-safe coverage
              </TypographyMuted>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-100">
              +8 pts recovery
            </div>
          </div>

          <div className="h-52 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={qualityTrendData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="run"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
                />
                <YAxis
                  domain={[80, 96]}
                  tickCount={5}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
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

        <MonitorCard eyebrow="Coverage Mix" title="Review coverage by locale">
          <div className="mb-4 flex flex-wrap gap-3 text-xs text-white/48">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-chart-4" />
              AI drafted
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-chart-1" />
              Human reviewed
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[rgba(244,114,182,0.8)]" />
              Blocked
            </div>
          </div>

          <div className="h-52 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reviewCoverageData}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                barCategoryGap={18}
              >
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="locale"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
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
                  fill="rgba(244,114,182,0.8)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MonitorCard>

        <MonitorCard eyebrow="Failure Modes" title="Issue breakdown">
          <div className="mb-4 flex items-center justify-between gap-4">
            <TypographyMuted className="text-white/50">
              Ranked by impact across current release checks
            </TypographyMuted>
            <TypographySmall className="text-white/72">50 total findings</TypographySmall>
          </div>

          <div className="h-52 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={issueBreakdownData}
                layout="vertical"
                margin={{ top: 6, right: 18, left: 10, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="issue"
                  width={82}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "rgba(255,255,255,0.52)", fontSize: 12 }}
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
                    fill="rgba(255,255,255,0.78)"
                    fontSize={12}
                  />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </MonitorCard>
      </div>
    </motion.div>
  );
}
